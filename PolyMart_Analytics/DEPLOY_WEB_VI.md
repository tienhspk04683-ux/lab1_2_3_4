# Triển khai PolyMart Analytics lên web

## Những gì đã được bổ sung
- Dockerfile production cho Node API và Flask UI (Gunicorn, không dùng Flask development server).
- `docker-compose.yml` để chạy hai tầng ứng dụng.
- Tách đúng cấu hình Flask (`NODE_BASE_URL`) khỏi cấu hình SQL Server.
- Mặc định cấu hình production tắt debug và bật TLS cho SQL Server.

## 1. Chuẩn bị SQL Server
1. Import `polymart.bacpac` vào SQL Server, tên database khuyến nghị `polymart`.
2. Xác nhận có đủ 10 bảng trong schema `dbo`.
3. Tạo login riêng cho ứng dụng (không nên dùng `sa`) và cấp quyền đọc/ghi cần thiết trên database `polymart`.
4. Bật TCP/IP, mở cổng SQL Server cho đúng máy chạy API. Với Azure SQL, dùng hostname dạng `xxxx.database.windows.net`, cổng 1433, mã hóa bật.
5. Không đưa mật khẩu vào Git hoặc gửi trong tin nhắn.

## 2. Chạy bằng Docker trên máy tính
Cài Docker Desktop, mở PowerShell tại thư mục `PolyMart_Analytics`, rồi chạy:

```powershell
Copy-Item .env.production.example .env
notepad .env
```

Sửa `DB_SERVER`, `DB_USER`, `DB_PASSWORD` và tạo `FLASK_SECRET_KEY` ngẫu nhiên. Nếu SQL Server chạy trực tiếp trên Windows host, `host.docker.internal` thường dùng được; nếu SQL Server ở máy khác, nhập hostname/IP có thể truy cập từ Docker.

```powershell
docker compose up --build -d
docker compose ps
docker compose logs -f api
```

Mở `http://localhost:5000`. Kiểm tra API tại `http://localhost:8080/api/health`.
Dừng ứng dụng: `docker compose down`.

## 3. Đưa lên hosting public
Kiến trúc cần 3 thành phần có thể truy cập nhau:
- Web service: build từ `client/Dockerfile`, public port do nền tảng cấp; đặt `NODE_BASE_URL` bằng URL nội bộ của API.
- API service: build từ `server/Dockerfile`, đặt các biến `DB_SERVER`, `DB_PORT`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`, `DB_ENCRYPT=true`, `DB_TRUST_SERVER_CERTIFICATE=false`.
- SQL Server: dùng Azure SQL hoặc SQL Server có IP/hostname public/private network mà API host truy cập được.

Nếu dùng nền tảng kiểu Render/Railway/Fly.io, tạo hai web/container services từ hai thư mục Dockerfile. Không đặt `NODE_BASE_URL=http://localhost:8080` trên hosting vì `localhost` ở web service không phải API service. Dùng private service URL nếu nền tảng hỗ trợ; nếu không, dùng HTTPS URL của API. Chỉ mở public API nếu cần và nên giới hạn truy cập.

## 4. Kiểm tra sau triển khai
- Mở `/api/health`: cần trả `api: "ok"` và `database: "connected"`.
- Mở `/api/customers` và `/api/analytics/overview`.
- Truy cập trang web và kiểm tra nhãn trạng thái kết nối ở thanh bên.
- Nếu `/api/health` lỗi, xem log API trước; nếu API tốt nhưng UI lỗi, kiểm tra `NODE_BASE_URL` trong cấu hình web service.

## 5. Giới hạn cần biết
- Tôi đã kiểm tra cấu trúc source ZIP và metadata BACPAC, nhưng không thể kết nối vào SQL Server/hosting thực tế của bạn trong phiên này nên chưa thể xác nhận database đã import hoặc website đã public thành công.
- `Todos` vẫn là demo lưu RAM; khởi động lại API sẽ mất danh sách.
- Schema `Orders` không có `CustomerID` và không có giá trị đơn hàng, nên dashboard không suy diễn doanh thu hay gắn đơn hàng với từng khách hàng.
- Trước khi public, nên bổ sung xác thực người dùng, CSRF protection cho các form thay đổi dữ liệu, rate limiting và backup database. Hiện tại ứng dụng chưa có hệ thống đăng nhập.
