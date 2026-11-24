require('dotenv').config();
const express = require('express');
const sql = require('mssql');

const app = express();
app.use(express.json({ limit: '1mb' }));

const port = Number(process.env.PORT || 8080);
const dbConfig = {
  server: process.env.DB_SERVER || 'localhost',
  port: Number(process.env.DB_PORT || 1433),
  database: process.env.DB_DATABASE || 'polymart',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  options: {
    encrypt: String(process.env.DB_ENCRYPT || 'false').toLowerCase() === 'true',
    trustServerCertificate: String(process.env.DB_TRUST_SERVER_CERTIFICATE || 'true').toLowerCase() === 'true'
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: 15000,
  requestTimeout: 30000
};

let poolPromise;
function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(dbConfig).connect().catch(err => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/', (req, res) => res.json({ name: 'PolyMart Analytics API', status: 'running' }));
app.get('/api/health', asyncRoute(async (req, res) => {
  const pool = await getPool();
  await pool.request().query('SELECT 1 AS ok');
  res.json({ api: 'ok', database: 'connected', databaseName: dbConfig.database });
}));

// Customers: use only columns that exist in the supplied BACPAC schema.
app.get('/api/customers', asyncRoute(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT CustomerID AS id, CustomerName AS name, Age AS age,
           PurchaseFrequency AS purchaseFrequency, AvgOrderValue AS avgOrderValue,
           RatingScore AS ratingScore, ReferrerID AS referrerId
    FROM dbo.Customers ORDER BY CustomerID
  `);
  res.json(result.recordset);
}));
app.get('/api/customers/:id', asyncRoute(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request().input('id', sql.VarChar(10), req.params.id).query(`
    SELECT CustomerID AS id, CustomerName AS name, Age AS age,
           PurchaseFrequency AS purchaseFrequency, AvgOrderValue AS avgOrderValue,
           RatingScore AS ratingScore, ReferrerID AS referrerId
    FROM dbo.Customers WHERE CustomerID=@id
  `);
  if (!result.recordset.length) return res.status(404).json({ error: 'Không tìm thấy khách hàng.' });
  res.json(result.recordset[0]);
}));
app.post('/api/customers', asyncRoute(async (req, res) => {
  const { id, name, age, purchaseFrequency, avgOrderValue, ratingScore, referrerId } = req.body || {};
  if (!id || !name) return res.status(400).json({ error: 'Mã khách hàng và họ tên là bắt buộc.' });
  const pool = await getPool();
  await pool.request()
    .input('id', sql.VarChar(10), String(id).trim())
    .input('name', sql.NVarChar(100), String(name).trim())
    .input('age', sql.Int, age === '' || age == null ? null : Number(age))
    .input('frequency', sql.Int, purchaseFrequency == null || purchaseFrequency === '' ? null : Number(purchaseFrequency))
    .input('avg', sql.Decimal(18,2), avgOrderValue == null || avgOrderValue === '' ? null : Number(avgOrderValue))
    .input('rating', sql.Decimal(3,1), ratingScore == null || ratingScore === '' ? null : Number(ratingScore))
    .input('referrer', sql.VarChar(10), referrerId || null)
    .query(`INSERT INTO dbo.Customers(CustomerID,CustomerName,Age,PurchaseFrequency,AvgOrderValue,RatingScore,ReferrerID)
            VALUES(@id,@name,@age,@frequency,@avg,@rating,@referrer)`);
  res.status(201).json({ success: true, message: 'Đã thêm khách hàng.' });
}));
app.put('/api/customers/:id', asyncRoute(async (req, res) => {
  const { name, age, purchaseFrequency, avgOrderValue, ratingScore, referrerId } = req.body || {};
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.VarChar(10), req.params.id)
    .input('name', sql.NVarChar(100), name || null)
    .input('age', sql.Int, age === '' || age == null ? null : Number(age))
    .input('frequency', sql.Int, purchaseFrequency == null || purchaseFrequency === '' ? null : Number(purchaseFrequency))
    .input('avg', sql.Decimal(18,2), avgOrderValue == null || avgOrderValue === '' ? null : Number(avgOrderValue))
    .input('rating', sql.Decimal(3,1), ratingScore == null || ratingScore === '' ? null : Number(ratingScore))
    .input('referrer', sql.VarChar(10), referrerId || null)
    .query(`UPDATE dbo.Customers SET CustomerName=COALESCE(@name,CustomerName), Age=@age,
            PurchaseFrequency=@frequency, AvgOrderValue=@avg, RatingScore=@rating, ReferrerID=@referrer
            WHERE CustomerID=@id`);
  if (!result.rowsAffected[0]) return res.status(404).json({ error: 'Không tìm thấy khách hàng.' });
  res.json({ success: true });
}));
app.delete('/api/customers/:id', asyncRoute(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request().input('id', sql.VarChar(10), req.params.id)
    .query('DELETE FROM dbo.Customers WHERE CustomerID=@id');
  if (!result.rowsAffected[0]) return res.status(404).json({ error: 'Không tìm thấy khách hàng.' });
  res.json({ success: true });
}));

// Dashboard KPIs and charts. The supplied schema has no CustomerID on Orders,
// so customer/order joins are intentionally not fabricated.
app.get('/api/analytics/overview', asyncRoute(async (req, res) => {
  const pool = await getPool();
  const [kpi, orderTrend, states, review, customerBands] = await Promise.all([
    pool.request().query(`
      SELECT (SELECT COUNT(*) FROM dbo.Customers) AS customers,
             (SELECT COUNT(*) FROM dbo.Orders) AS orders,
             (SELECT COUNT(*) FROM dbo.Reviews) AS reviews,
             (SELECT COUNT(*) FROM dbo.UserBehaviorHistory) AS behaviorEvents,
             (SELECT COUNT(*) FROM dbo.NetworkNodes) AS networkNodes,
             (SELECT COUNT(*) FROM dbo.NetworkEdges) AS networkEdges
    `),
    pool.request().query(`SELECT CONVERT(char(7),OrderDate,120) AS month, COUNT(*) AS total
                          FROM dbo.Orders WHERE OrderDate IS NOT NULL
                          GROUP BY CONVERT(char(7),OrderDate,120) ORDER BY month`),
    pool.request().query(`SELECT s.StateName AS state, COUNT(*) AS total
                          FROM dbo.UserBehaviorHistory h
                          LEFT JOIN dbo.BehaviorStates s ON s.StateID=h.CurrentStateID
                          GROUP BY s.StateName ORDER BY total DESC`),
    pool.request().query(`SELECT COUNT(*) AS total,
                          SUM(CASE WHEN ISNULL(IsSpam,0)=1 THEN 1 ELSE 0 END) AS spam
                          FROM dbo.Reviews`),
    pool.request().query(`SELECT CASE WHEN ISNULL(PurchaseFrequency,0)=0 THEN N'Chưa có tần suất'
                          WHEN PurchaseFrequency<=2 THEN N'Thấp (1-2)'
                          WHEN PurchaseFrequency<=5 THEN N'Trung bình (3-5)'
                          ELSE N'Cao (>5)' END AS band, COUNT(*) AS total
                          FROM dbo.Customers GROUP BY CASE WHEN ISNULL(PurchaseFrequency,0)=0 THEN N'Chưa có tần suất'
                          WHEN PurchaseFrequency<=2 THEN N'Thấp (1-2)'
                          WHEN PurchaseFrequency<=5 THEN N'Trung bình (3-5)' ELSE N'Cao (>5)' END`)
  ]);
  res.json({
    kpi: kpi.recordset[0], orderTrend: orderTrend.recordset,
    behaviorStates: states.recordset, reviews: review.recordset[0],
    customerBands: customerBands.recordset
  });
}));

app.get('/api/analytics/behavior', asyncRoute(async (req, res) => {
  const pool = await getPool();
  const [summary, stateCounts, transitions, customerActivity] = await Promise.all([
    pool.request().query(`SELECT COUNT(*) AS events, COUNT(DISTINCT CustomerID) AS customers,
                          MIN([Timestamp]) AS firstEvent, MAX([Timestamp]) AS lastEvent
                          FROM dbo.UserBehaviorHistory`),
    pool.request().query(`SELECT s.StateName AS state, COUNT(*) AS total
                          FROM dbo.UserBehaviorHistory h
                          LEFT JOIN dbo.BehaviorStates s ON s.StateID=h.CurrentStateID
                          GROUP BY s.StateName ORDER BY total DESC`),
    pool.request().query(`SELECT a.StateName AS fromState, b.StateName AS toState, COUNT(*) AS transitions
                          FROM dbo.UserBehaviorHistory h
                          LEFT JOIN dbo.BehaviorStates a ON a.StateID=h.CurrentStateID
                          LEFT JOIN dbo.BehaviorStates b ON b.StateID=h.NextStateID
                          WHERE h.CurrentStateID IS NOT NULL AND h.NextStateID IS NOT NULL
                          GROUP BY a.StateName,b.StateName ORDER BY transitions DESC`),
    pool.request().query(`SELECT TOP 20 h.CustomerID AS customerId, c.CustomerName AS customerName,
                          COUNT(*) AS eventCount, MAX(h.[Timestamp]) AS lastSeen
                          FROM dbo.UserBehaviorHistory h
                          LEFT JOIN dbo.Customers c ON c.CustomerID=h.CustomerID
                          GROUP BY h.CustomerID,c.CustomerName ORDER BY eventCount DESC`)
  ]);
  const counts = transitions.recordset;
  const totals = {};
  counts.forEach(x => { totals[x.fromState || 'Không xác định'] = (totals[x.fromState || 'Không xác định'] || 0) + Number(x.transitions); });
  const markov = counts.map(x => ({
    fromState: x.fromState, toState: x.toState, transitions: Number(x.transitions),
    probability: totals[x.fromState || 'Không xác định'] ? Number(x.transitions) / totals[x.fromState || 'Không xác định'] : 0
  }));
  res.json({ summary: summary.recordset[0], stateCounts: stateCounts.recordset, markov, customerActivity: customerActivity.recordset });
}));

app.get('/api/analytics/markov-matrix', asyncRoute(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT a.StateName AS fromState, b.StateName AS toState,
           CAST(m.TransitionProbability AS FLOAT) AS probability
    FROM dbo.MarkovTransitionMatrix m
    LEFT JOIN dbo.BehaviorStates a ON a.StateID=m.FromStateID
    LEFT JOIN dbo.BehaviorStates b ON b.StateID=m.ToStateID
    ORDER BY m.FromStateID,m.ToStateID
  `);
  res.json(result.recordset);
}));

app.get('/api/analytics/reviews', asyncRoute(async (req, res) => {
  const pool = await getPool();
  const [summary, customers] = await Promise.all([
    pool.request().query(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN ISNULL(IsSpam,0)=1 THEN 1 ELSE 0 END) AS spam,
      SUM(CASE WHEN ISNULL(KeywordBad,0)>0 THEN 1 ELSE 0 END) AS badKeyword,
      SUM(CASE WHEN ISNULL(KeywordAd,0)>0 THEN 1 ELSE 0 END) AS adKeyword,
      SUM(CASE WHEN ISNULL(PatternRepeat,0)>0 THEN 1 ELSE 0 END) AS repeatedPattern
      FROM dbo.Reviews`),
    pool.request().query(`SELECT TOP 20 CustomerID AS customerId, COUNT(*) AS reviews,
      SUM(CASE WHEN ISNULL(IsSpam,0)=1 THEN 1 ELSE 0 END) AS spamReviews
      FROM dbo.Reviews WHERE CustomerID IS NOT NULL GROUP BY CustomerID ORDER BY spamReviews DESC,reviews DESC`)
  ]);
  res.json({ summary: summary.recordset[0], customers: customers.recordset });
}));

app.get('/api/analytics/network', asyncRoute(async (req, res) => {
  const pool = await getPool();
  const [nodes, edges] = await Promise.all([
    pool.request().query(`SELECT NodeID AS id,NodeName AS name,NodeType AS type,Address AS address,
                          CoordinateX AS x,CoordinateY AS y FROM dbo.NetworkNodes ORDER BY NodeID`),
    pool.request().query(`SELECT e.EdgeID AS id,e.SourceID AS source,e.TargetID AS target,
                          e.DistanceKM AS distanceKm, a.NodeName AS sourceName,b.NodeName AS targetName
                          FROM dbo.NetworkEdges e
                          LEFT JOIN dbo.NetworkNodes a ON a.NodeID=e.SourceID
                          LEFT JOIN dbo.NetworkNodes b ON b.NodeID=e.TargetID ORDER BY e.EdgeID`)
  ]);
  res.json({ nodes: nodes.recordset, edges: edges.recordset });
}));

app.get('/api/orders', asyncRoute(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request().query(`SELECT OrderID AS id,OrderDate AS orderDate,Status AS status
                                             FROM dbo.Orders ORDER BY OrderDate DESC`);
  res.json(result.recordset);
}));

// The starter project exposed a TODO page but there is no Todos table in the
// supplied BACPAC. Keep a small in-memory demo list without pretending it is persistent.
const todos = [];
app.get('/api/todos', (req, res) => res.json(todos));
app.post('/api/todos', (req, res) => {
  const title = String((req.body || {}).title || '').trim();
  if (!title) return res.status(400).json({ error: 'Nội dung công việc là bắt buộc.' });
  const item = { id: Date.now(), title, done: false };
  todos.push(item);
  res.status(201).json(item);
});
app.patch('/api/todos/:id', (req, res) => {
  const item = todos.find(x => x.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Không tìm thấy công việc.' });
  item.done = Boolean(req.body.done);
  res.json(item);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: 'Lỗi máy chủ hoặc truy vấn cơ sở dữ liệu.',
    detail: process.env.NODE_ENV === 'production' ? undefined : err.message
  });
});
app.listen(port, () => console.log(`PolyMart API đang chạy tại http://localhost:${port}`));
