import os
from functools import wraps
import requests
from dotenv import load_dotenv
from flask import Flask, render_template, request, redirect, url_for, flash

load_dotenv()
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "change-this-secret-key")
NODE_BASE_URL = os.getenv("NODE_BASE_URL", "http://127.0.0.1:8080").rstrip("/")
TIMEOUT = 12

def api_get(path, default=None):
    try:
        response = requests.get(f"{NODE_BASE_URL}{path}", timeout=TIMEOUT)
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        app.logger.warning("API GET %s failed: %s", path, exc)
        return default

def api_write(method, path, payload=None):
    try:
        response = requests.request(method, f"{NODE_BASE_URL}{path}", json=payload, timeout=TIMEOUT)
        response.raise_for_status()
        return True, response.json() if response.content else {}
    except requests.HTTPError as exc:
        try: message = exc.response.json().get("error", str(exc))
        except Exception: message = str(exc)
        return False, message
    except requests.RequestException as exc:
        return False, f"Không kết nối được API: {exc}"

@app.context_processor
def inject_status():
    health = api_get("/api/health", {})
    return {"api_connected": health.get("database") == "connected"}

@app.route("/")
def index():
    data = api_get("/api/analytics/overview", {})
    return render_template("index.html", data=data)

@app.route("/customers")
def customers():
    rows = api_get("/api/customers", [])
    return render_template("customers.html", customers=rows)

@app.route("/customers/add", methods=["POST"])
def add_customer():
    payload = {
        "id": request.form.get("id", "").strip(),
        "name": request.form.get("name", "").strip(),
        "age": request.form.get("age") or None,
        "purchaseFrequency": request.form.get("purchaseFrequency") or None,
        "avgOrderValue": request.form.get("avgOrderValue") or None,
        "ratingScore": request.form.get("ratingScore") or None,
        "referrerId": request.form.get("referrerId") or None
    }
    ok, result = api_write("POST", "/api/customers", payload)
    flash("Đã thêm khách hàng." if ok else f"Không thể thêm: {result}", "success" if ok else "error")
    return redirect(url_for("customers"))

@app.route("/customers/<customer_id>/delete", methods=["POST"])
def delete_customer(customer_id):
    ok, result = api_write("DELETE", f"/api/customers/{customer_id}")
    flash("Đã xóa khách hàng." if ok else f"Không thể xóa: {result}", "success" if ok else "error")
    return redirect(url_for("customers"))

@app.route("/analytics")
def analytics():
    data = api_get("/api/analytics/overview", {})
    return render_template("analytics.html", data=data)

@app.route("/behavior")
def behavior():
    data = api_get("/api/analytics/behavior", {})
    matrix = api_get("/api/analytics/markov-matrix", [])
    return render_template("behavior.html", data=data, matrix=matrix)

@app.route("/reviews")
def reviews():
    data = api_get("/api/analytics/reviews", {})
    return render_template("reviews.html", data=data)

@app.route("/network")
def network():
    data = api_get("/api/analytics/network", {"nodes": [], "edges": []})
    return render_template("network.html", data=data)

@app.route("/orders")
def orders():
    rows = api_get("/api/orders", [])
    return render_template("orders.html", orders=rows)

@app.route("/todos", methods=["GET", "POST"])
def todos():
    if request.method == "POST":
        ok, result = api_write("POST", "/api/todos", {"title": request.form.get("title", "")})
        flash("Đã thêm công việc." if ok else str(result), "success" if ok else "error")
        return redirect(url_for("todos"))
    return render_template("todos.html", todos=api_get("/api/todos", []))

@app.route("/todos/<int:todo_id>/toggle", methods=["POST"])
def toggle_todo(todo_id):
    current = api_get("/api/todos", [])
    item = next((x for x in current if x["id"] == todo_id), None)
    if item:
        api_write("PATCH", f"/api/todos/{todo_id}", {"done": not item.get("done", False)})
    return redirect(url_for("todos"))

if __name__ == "__main__":
    app.run(host=os.getenv("FLASK_HOST", "127.0.0.1"),
            port=int(os.getenv("FLASK_PORT", "5000")),
            debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")
