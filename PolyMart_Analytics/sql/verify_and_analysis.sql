USE [polymart];
GO
-- 1. Kiểm tra số lượng bản ghi trong 10 bảng
SELECT 'Customers' AS TableName, COUNT_BIG(*) AS TotalRows FROM dbo.Customers
UNION ALL SELECT 'Orders', COUNT_BIG(*) FROM dbo.Orders
UNION ALL SELECT 'Reviews', COUNT_BIG(*) FROM dbo.Reviews
UNION ALL SELECT 'UserBehaviorHistory', COUNT_BIG(*) FROM dbo.UserBehaviorHistory
UNION ALL SELECT 'BehaviorStates', COUNT_BIG(*) FROM dbo.BehaviorStates
UNION ALL SELECT 'MarkovTransitionMatrix', COUNT_BIG(*) FROM dbo.MarkovTransitionMatrix
UNION ALL SELECT 'NetworkNodes', COUNT_BIG(*) FROM dbo.NetworkNodes
UNION ALL SELECT 'NetworkEdges', COUNT_BIG(*) FROM dbo.NetworkEdges
UNION ALL SELECT 'Shippers', COUNT_BIG(*) FROM dbo.Shippers
UNION ALL SELECT 'OrderShipperMapping', COUNT_BIG(*) FROM dbo.OrderShipperMapping;
GO
-- 2. Phân bố khách hàng theo tần suất mua
SELECT CASE WHEN ISNULL(PurchaseFrequency,0)=0 THEN N'Chưa có tần suất'
            WHEN PurchaseFrequency<=2 THEN N'Thấp (1-2)'
            WHEN PurchaseFrequency<=5 THEN N'Trung bình (3-5)'
            ELSE N'Cao (>5)' END AS FrequencyBand,
       COUNT(*) AS CustomerCount,
       AVG(CAST(AvgOrderValue AS decimal(18,2))) AS AverageOrderValue
FROM dbo.Customers
GROUP BY CASE WHEN ISNULL(PurchaseFrequency,0)=0 THEN N'Chưa có tần suất'
              WHEN PurchaseFrequency<=2 THEN N'Thấp (1-2)'
              WHEN PurchaseFrequency<=5 THEN N'Trung bình (3-5)'
              ELSE N'Cao (>5)' END;
GO
-- 3. Ước lượng xác suất chuyển trạng thái từ dữ liệu hành vi
WITH TransitionCounts AS (
  SELECT CurrentStateID, NextStateID, COUNT_BIG(*) AS TransitionCount
  FROM dbo.UserBehaviorHistory
  WHERE CurrentStateID IS NOT NULL AND NextStateID IS NOT NULL
  GROUP BY CurrentStateID, NextStateID
)
SELECT a.StateName AS FromState, b.StateName AS ToState,
       t.TransitionCount,
       CAST(1.0*t.TransitionCount / NULLIF(SUM(t.TransitionCount) OVER(PARTITION BY t.CurrentStateID),0) AS decimal(10,4)) AS EstimatedProbability
FROM TransitionCounts t
LEFT JOIN dbo.BehaviorStates a ON a.StateID=t.CurrentStateID
LEFT JOIN dbo.BehaviorStates b ON b.StateID=t.NextStateID
ORDER BY t.CurrentStateID,t.NextStateID;
GO
-- 4. Tỷ lệ nhãn spam và các dấu hiệu trong Reviews
SELECT COUNT(*) AS TotalReviews,
       SUM(CASE WHEN ISNULL(IsSpam,0)=1 THEN 1 ELSE 0 END) AS SpamReviews,
       SUM(CASE WHEN ISNULL(KeywordBad,0)>0 THEN 1 ELSE 0 END) AS BadKeywordReviews,
       SUM(CASE WHEN ISNULL(KeywordAd,0)>0 THEN 1 ELSE 0 END) AS AdKeywordReviews,
       SUM(CASE WHEN ISNULL(PatternRepeat,0)>0 THEN 1 ELSE 0 END) AS RepeatedPatternReviews
FROM dbo.Reviews;
GO
