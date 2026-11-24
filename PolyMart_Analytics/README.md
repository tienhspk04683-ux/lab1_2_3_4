# PolyMart Analytics – hoàn thiện dự án

Dự án giữ kiến trúc hai tầng của mã nguồn ban đầu: **Flask (giao diện) → Node.js/Express (REST API) → SQL Server**. Các màn hình quản lý và phân tích truy vấn trực tiếp cơ sở dữ liệu PolyMart được cung cấp trong `polymart(1).bacpac`.

## 1. Phạm vi đã xây dựng

- Dashboard tổng quan: số khách hàng, đơn hàng, đánh giá, sự kiện hành vi, nút/cạnh mạng lưới.
- Quản lý khách hàng: danh sách, thêm, xóa; các cột bổ sung lấy đúng từ schema `Customers`.
- Đơn hàng: danh sách và xu hướng theo tháng.
- Phân tích hành vi: phân bố trạng thái, hoạt động theo khách hàng, các chuyển trạng thái và xác suất Markov ước lượng từ `UserBehaviorHistory`.
- Ma trận Markov lưu sẵn: đọc riêng từ `MarkovTransitionMatrix`.
- Phân tích review: thống kê nhãn `IsSpam`, `KeywordBad`, `KeywordAd`, `PatternRepeat`.
- Mạng lưới: xem `NetworkNodes` và `NetworkEdges`.
- Todos: giữ lại chức năng demo ban đầu; do BACPAC không có bảng Todos, dữ liệu Todos chỉ nằm trong RAM và mất khi Node API khởi động lại.

## 2. Schema đã đối chiếu

BACPAC có 10 bảng: `BehaviorStates`, `Customers`, `MarkovTransitionMatrix`, `NetworkEdges`, `NetworkNodes`, `Orders`, `OrderShipperMapping`, `Reviews`, `Shippers`, `UserBehaviorHistory`.

Một số cột chính:
- `Customers`: `CustomerID`, `CustomerName`, `Age`, `PurchaseFrequency`, `AvgOrderValue`, `RatingScore`, `ReferrerID`.
- `Orders`: `OrderID`, `OrderDate`, `Status`.
- `UserBehaviorHistory`: `LogID`, `CustomerID`, `CurrentStateID`, `NextStateID`, `Timestamp`.
- `Reviews`: `ReviewID`, `CustomerID`, `KeywordBad`, `KeywordAd`, `PatternRepeat`, `IsSpam`.

**Giới hạn quan trọng của dữ liệu:** `Orders` trong schema hiện tại không có `CustomerID` và cũng không có cột giá trị đơn hàng. Vì vậy ứng dụng không giả lập JOIN đơn hàng với khách hàng, không tự tính doanh thu/LTV, và chỉ tổng hợp số đơn theo tháng. `Customers.AvgOrderValue` là số liệu đã lưu sẵn ở cấp khách hàng.

## 3. Yêu cầu môi trường

- Windows 10/11 hoặc môi trường có Node.js 18+ và Python 3.10+.
- Microsoft SQL Server (Developer/Express/Standard) đang chạy.
- SQL Server Management Studio (SSMS) hoặc `SqlPackage` để import BACPAC.
- Cho phép TCP/IP và cổng SQL Server (mặc định 1433) nếu dùng kết nối TCP.

## 4. Import BACPAC

1. Mở SSMS → Connect tới SQL Server.
2. Chuột phải `Databases` → `Import Data-tier Application...`.
3. Chọn file `polymart(1).bacpac`.
4. Đặt tên database, khuyến nghị `polymart`.
5. Hoàn tất import và kiểm tra 10 bảng trong schema `dbo`.

Có thể dùng SqlPackage:
```powershell
SqlPackage /Action:Import /SourceFile:"C:\path\polymart(1).bacpac" /TargetServerName:"localhost" /TargetDatabaseName:"polymart" /TargetUser:"sa" /TargetPassword:"YOUR_PASSWORD" /TargetTrustServerCertificate:True
```
Điều chỉnh máy chủ, xác thực và đường dẫn theo máy của bạn.

## 5. Cấu hình và chạy

### Node.js API
```powershell
cd PolyMart_Analytics\server
copy .env.example .env
```
Mở `server/.env`, cập nhật `DB_SERVER`, `DB_PORT`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`. Không đưa mật khẩu thật lên Git hoặc chia sẻ công khai.

```powershell
npm install
npm start
```
Kiểm tra `http://127.0.0.1:8080/api/health`. Kết quả đúng có `api: "ok"` và `database: "connected"`.

### Flask UI
Mở terminal thứ hai:
```powershell
cd PolyMart_Analytics\client
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python app.py
```
Mở `http://127.0.0.1:5000`.

Linux/macOS:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python app.py
```

## 6. Cách đọc phân tích hành vi

- Trạng thái hiện tại: đếm `CurrentStateID` và nối `BehaviorStates.StateID`.
- Chuyển trạng thái: đếm cặp `CurrentStateID → NextStateID`.
- Xác suất ước lượng: `P(i→j) = count(i→j) / sum_j count(i→j)`.
- Ma trận được lưu: `MarkovTransitionMatrix.TransitionProbability` hiển thị độc lập, không bị ghi đè bởi ước lượng.
- Hoạt động khách hàng: đếm số bản ghi `UserBehaviorHistory` theo `CustomerID`.

Đây là mô hình Markov bậc một dựa trên cặp trạng thái có sẵn trong lịch sử. Chất lượng dự báo phụ thuộc vào độ đầy đủ, thứ tự và cách gán trạng thái trong dữ liệu; dashboard hiện trình bày phân bố và xác suất chuyển tiếp, chưa khẳng định độ chính xác dự báo tương lai.

## 7. Xử lý lỗi thường gặp

- `Login failed`: kiểm tra user/password, bật SQL Server Authentication (Mixed Mode) nếu dùng `sa`, khởi động lại dịch vụ SQL Server.
- `ECONNREFUSED`: kiểm tra SQL Server đang chạy, TCP/IP được bật, cổng và firewall.
- `Cannot open database`: tên `DB_DATABASE` không khớp tên database sau khi import.
- API online nhưng dashboard báo lỗi: mở `http://127.0.0.1:8080/api/health` và xem log Node terminal.
- Trang Flask không kết nối API: giữ Node chạy ở terminal riêng, kiểm tra `NODE_BASE_URL` trong `client/.env`.

## 8. Kiểm tra nhanh

1. `GET /api/health`
2. `GET /api/customers`
3. `GET /api/analytics/overview`
4. `GET /api/analytics/behavior`
5. `GET /api/analytics/markov-matrix`
6. `GET /api/analytics/reviews`
7. `GET /api/analytics/network`

## 9. Lưu ý triển khai

Bộ mã nguồn đã được dựng dựa trên schema thật của BACPAC và sửa các lỗi nhìn thấy trong starter (IP Node hard-code, API thiếu, route customers thiếu template, `app.listen()` gọi hai lần). Tuy nhiên không thể xác nhận kết nối tới SQL Server trên máy cá nhân của bạn từ môi trường tạo file này. Bạn cần import BACPAC và cập nhật thông tin kết nối trước khi chạy.


## 10. Chạy production / đưa lên web

Xem `DEPLOY_WEB_VI.md`. Dự án đã bổ sung Dockerfile cho hai dịch vụ và Docker Compose để chạy local/production. Khi triển khai public, phải cấu hình `NODE_BASE_URL` trỏ tới API service thực tế và SQL Server phải cho phép API host kết nối.
