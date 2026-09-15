# Company Hub — Associate / Business Portal

A hosted web app where every associate in your company logs in and sees:
their own business, their team's business, unlimited-level referral tree,
commission payouts, and payments — plus an Admin Panel to manage up to
thousands of associates, record bookings, and control commission %.

Built with **Node.js + Express + PostgreSQL + EJS**. No frontend build step —
deploys directly to any VPS (DigitalOcean, AWS Lightsail, Hostinger VPS, etc).

---

## 1. What's inside

```
company-hub/
├── server.js              # app entry point
├── schema.sql              # full database schema
├── config/db.js            # PostgreSQL connection pool
├── middleware/auth.js      # login / admin guards
├── models/                 # tree.js (recursive referral logic),
│                            # commission.js (payout engine), dashboard.js,
│                            # associate.js
├── routes/                 # auth.js, associate.js (all menu pages), admin.js
├── views/                  # EJS templates (associate pages + views/admin/*)
├── public/css/style.css
├── scripts/migrate.js      # creates all tables
├── scripts/seed.js         # creates default admin + default commission %
└── .env.example            # copy to .env and fill in
```

## 2. How the referral / commission system works

- Every associate has a `parent_id` — whoever they signed up under (their sponsor).
- This link goes **unlimited levels deep** — there's no cap on chain length,
  it's handled with a recursive SQL query (`WITH RECURSIVE`), so it works
  the same whether a chain is 3 people deep or 30.
- `commission_settings` table maps **level → percentage**:
  - Level 0 = the associate's own sale
  - Level 1 = their direct sponsor
  - Level 2 = sponsor's sponsor, and so on
  - You decide how many levels actually get paid (e.g. only 0–5); levels
    beyond that simply pay 0%, while the tree itself keeps tracking depth
    for reporting (Referral Tree / Downline pages still show everyone).
- When Admin adds a **Booking** (a sale), the system automatically walks
  up that associate's entire upline and creates a `payout` row for every
  level that has a % configured — instantly calculating everyone's commission.
- **Payout Detail** = commission from your own sales.
  **Team Payout Report** = commission you earned from your team's sales.
  **Payments** = actual money transferred to you (recorded by admin).
  **Balance** = Payout total − Payment total.

You can freely change the commission % per level anytime from
Admin → Commission Settings — it applies to all future bookings.

## 3. Deploying to a VPS (Ubuntu 22.04/24.04 example)

### Install Node.js + PostgreSQL
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs postgresql postgresql-contrib
```

### Create the database
```bash
sudo -u postgres psql
CREATE DATABASE company_hub;
CREATE USER company_hub_user WITH ENCRYPTED PASSWORD 'choose_a_strong_password';
GRANT ALL PRIVILEGES ON DATABASE company_hub TO company_hub_user;
\q
```

### Upload the project & install dependencies
```bash
# from your local machine, upload the company-hub folder to the server, e.g.:
scp -r company-hub root@YOUR_SERVER_IP:/var/www/

# on the server:
cd /var/www/company-hub
npm install
cp .env.example .env
nano .env          # fill in DB_PASSWORD, SESSION_SECRET, COMPANY_NAME, etc.
```

### Run migrations + seed the default admin
```bash
npm run migrate     # creates all tables
npm run seed         # creates default admin (admin@company.com / Admin@123)
```
**Immediately log in as that admin and change the password** from
Change Password / or update it directly, then create your real admin account.

### Keep it running with PM2
```bash
sudo npm install -g pm2
pm2 start server.js --name company-hub
pm2 save
pm2 startup          # follow the printed instructions so it survives reboots
```

### Put Nginx in front (for your domain + free HTTPS)
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```
Create `/etc/nginx/sites-available/company-hub`:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/company-hub /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com   # free SSL
```

Your site is now live at `https://yourdomain.com`.

## 4. Day-to-day usage

- **Admin** logs in → Admin Panel → adds associates (or shares each
  associate's personal referral link so they can self-signup and
  automatically nest under the right sponsor) → adds bookings as sales
  come in → approves/marks payouts as paid → records actual payments.
- **Associates** log in → see their own Dashboard, share their referral
  link from "Referral Work" to grow their team, and track everything
  else read-only.

## 5. Scaling to ~2000 associates

The schema is indexed on `parent_id`, `associate_id`, and dates, and the
recursive tree queries are standard PostgreSQL CTEs — this comfortably
handles a few thousand associates and tens of thousands of bookings on
a small VPS (1–2 GB RAM). If you eventually grow much larger (tens of
thousands+), consider adding the `ltree` PostgreSQL extension for
materialized-path lookups, but it isn't needed at this scale.

## 6. Security notes before going live

- Change the default admin password immediately.
- Generate a long random `SESSION_SECRET` in `.env` (never reuse the example).
- Always run behind HTTPS (the Nginx + certbot steps above).
- Take regular PostgreSQL backups: `pg_dump company_hub > backup.sql`.
