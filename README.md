# WealthFund Calling CRM  (React + Node.js + MySQL / XAMPP)

Facebook leads (Google Sheet / CSV / Excel) → MySQL database → calling desk with timer → remarks → admin monitoring.

## 1. Setup on Windows with XAMPP (one time)
1. Install **Node.js LTS** (https://nodejs.org).
2. Open **XAMPP Control Panel** → click **Start** next to **MySQL** (Apache is not needed).
3. Create the database — pick ONE:
   * **Automatic:** do nothing. The app creates the database `calling_crm` and every table on its first start.
   * **Manual (phpMyAdmin):** http://localhost/phpmyadmin → **Import** → choose `database/calling_crm.sql` → **Go**.
4. Double-click **`1-install.bat`** (installs + builds, takes a few minutes), then **`2-start.bat`**.
   (Or in a terminal: `npm run install:all`, `npm run build`, `npm start`.)
5. Open http://localhost:5000

Database settings are in **`server/.env`** (already set to the XAMPP defaults: user `root`, empty password, database `calling_crm`). If you set a MySQL password in XAMPP, write it in `DB_PASSWORD=`. Also change `JWT_SECRET` to any long random text.

## 2. Two separate panels
| Panel | Login page | Who | Pages |
|---|---|---|---|
| **Admin** | `/admin/login` | admin | Dashboard, All Clients (Import · Edit · Delete · bulk assign/delete), Executives, Activity Log, Call Logs, Analytics |
| **Executive** | `/login` | executive | My Dashboard, Call Desk, Phone Mode, Clients (Edit), My Calls, My Activity |

First admin: **9999999999 / admin123**. Change the login **mobile number and password** any time: sidebar → **Account settings** (needs the current password). Admin can also change an executive's number/password from **Executives → Edit**.

## 3. Calling from the PC → opens on the mobile dial pad → PC pop-up after the call
One-time: on your **mobile** open `http://<PC-IP>:5000/executive/phone` (the start window prints the exact address; phone and PC on the **same Wi-Fi**) and sign in with the **same mobile number + password** as on the PC. Keep that page open (screen on).
1. Press **Call** on the PC → the phone vibrates and its **dial pad opens with the number** (if the browser blocks the auto-open, tap the big green **Call now** button once).
2. Talk. The PC shows the running timer.
3. When the call is over, come back to the CRM page on the phone (or tap **Call finished**) → the PC immediately shows the **Call ended** pop-up with the **duration**, which is already saved in MySQL.
You can still press **End call** on the PC yourself. If the phone page is not open, the PC shows a **QR code** — scan it and the dial pad opens.
* The timer restarts at the moment the phone opens the dial pad, so waiting time is not counted.
* A web page cannot read the phone's real call state; "coming back from the dial pad" is how the end is detected. For the exact talk time a small Android app would be needed.
* If Windows Firewall asks about Node.js on first start, click **Allow** (needed for the phone to reach the PC).

## 3b. Android app (recommended — exact call end)
`android-app/` has the **CRM Dialer** app. It opens the phone's dial pad when you press Call on the PC and detects the real call end, so the PC pop-up and duration are exact. Build steps: `android-app/README.md`. The web "Phone Mode" page still works as a fallback.

## Troubleshooting
* `Cannot connect to MySQL … ECONNREFUSED 3306` → MySQL is not running. XAMPP Control Panel → **Start** next to MySQL (must be green). The CRM now **waits and reconnects by itself** — no restart needed. You do not need to create the database; it is created automatically.
* If MySQL keeps stopping, close other MySQL/MariaDB programs using port 3306, or in XAMPP click **Logs** next to MySQL.

## 4. After the call — everything optional
The pop-up after **End call** can be closed (✕ / Esc / **Skip**) without result or remark. The call and its duration are still counted. Earlier remarks stay on the client and are shown in the pop-up.

## 5. Clients
* **All Clients → Import** (admin): CSV / Excel / Google Sheet. Duplicates skipped, `+91`/`p:` cleaned, history of imports saved in the database. No export option.
* **Edit** on every row (name, remark; admin also mobile number and executive). **Delete** (admin) with confirmation, single or **Delete selected**.
* Once **Account = OPENED** the client is locked to that executive. Min. 6 calls per client. Call duration is measured by the server and cannot be edited.

## 6. Activity tracking (table `activity_log`)
Sign-in/out, calls (start / end / result), status / group / webinar / account changes (old → new), remark edits, takeovers, client add / edit / assign / delete, imports, login-number and password changes — with user, time, client, details and IP. Admin: **Activity Log** (filter by executive, type, date). Executive: **My Activity**.

## Database tables
`users` · `leads` · `calls` · `activity_log` · `attendance` · `trusted_devices` · `login_otps` · `lead_shares` — see `database/calling_crm.sql`.
All clients (imported from CSV / Excel / Google Sheet, or added by hand) are in ONE table: `leads` (`source` = manual / file / google-sheet, `import_label` = which file). There are no separate import tables; import history is read from `activity_log`; connected Google Sheets are kept in `server/data/sheet-sources.json`. Back up with phpMyAdmin → Export.

## Optional
`npm run seed` fills demo executives (9000000100…104 / demo1234) and clients — **never on your real database**.
Other `.env` keys: `PORT` (5000) · `APP_TZ` (Asia/Kolkata) · `MIN_CALLS` (6) · `SYNC_MINUTES` (15, 0 = off) · `DB_HOST` · `DB_PORT` · `DB_USER` · `DB_NAME`.


---

## Navi sutvidha (v2): Inbox, Attendance, Share, OTP login

**Database:** kahi import karaycha nahi. Server chalu hotach database + sarv tables ani navin columns aapoaap banatat/jodle jatat
(juna data tasach rahto). `database/calling_crm.sql` fakt navin install sathi aahe.

**1. Inbox (Executive)** - fresh (kadhi call n kelele) clients doghanna *aajchya present executives* madhe barobar vatle jatat.
Filters: Fresh / Call-backs / Shared with me / In progress / All mine. Jo executive aaj login karat nahi (kinva Absent/Leave mark kelay)
tyala kahi milat nahi; tyache untouched clients itar present executives la jatat. Late login kelyavar tyalahi tyacha vata milto.
Admin: *Fresh Inbox* page - kon present, kitke clients, *Distribute now* button.
Call kelela / admin ne assign kelela / share kelela client konakadun parat ghetla jat nahi.

**2. Share** - Inbox / Clients madhe **Share** button: client dusrya executive kade jato (note sobat), tyachya Inbox madhe "Shared with me".

**3. Attendance** - Admin: *Attendance* page (mahina-nihay grid, present/absent/leave/half-day, kontyahi divsavar click karun badla).
Executive login kela ki to aapoaap *Present*. Executive la fakt swatacha record disto. Ravivar weekly off (server/.env -> WEEKLY_OFF).

**4. OTP login** - navin PC / browser / phone var pahilyanda mobile + password nantar OTP. Nantar fakt mobile + password.
OTP executive chya swatachya mobile var SMS ne yeto (Powerstext, sender DSAENT, DLT template). Setup: `server/.env` madhe
`SMS_AUTH_KEY=` bhara ani `OTP_MODE=sms` theva (`both` = SMS + admin la pan disto, SMS fail zala tar fallback).
Executives page -> *Devices* madhun kontahi PC kadhun takta yeto (parat OTP lagel). Android app madhe pan hach OTP step aahe (ekda).
Ek OTP nantar 30 sec cha gap (SMS spam hot nahi), 1 tasat max 8 OTP, 5 chukichya try nantar OTP radd.

**5. Manual client** - executive ne add kela tar to tyachya swatachya inbox madhe; admin ne add kela tar fresh pool madhe jato ani present executives madhe vatla jato.


---

## Navi sutvidha (v3): 12 vajta cutoff + auto distribution

**Niyam (fresh clients vatap):**
| Vel | Kon vatun ghet |
|---|---|
| **12:00 chya aadhi** | Sarva executives jyanna admin ne *Absent/Leave* mark kele nahi (4 executive = 4 bhag). Ajun login kela nasla tari te expected asatat. |
| **12:00 nantar** | Fakt jyani login kela (Present / Half-day). Jo login karat nahi tyache *untouched* clients baki present executives madhe barobar vatle jatat (4 -> 3 bhag). |
| Admin ne Absent/Leave lavla | Tyach kshani to vatnitun baher, client baki executives la. |
| Late login (12 nantar) | To parat present hoto, tyala tyacha vata parat milto. |
| Ravivar (weekly off) | Fakt jyani login kela tyanach. |

* **Import kela ki client aapoaap distribute** hotat (file, Google Sheet, auto-sync) - "Distribute now" daabaych garaj nahi. Server dar 1 minutala check karto (12 vajle ki aapoaap badlato).
* Call kelela / admin ne assign kelela / share kelela client konakadun hirvun ghetla jat nahi.
* **Inbox**: default list = **My work list** - **aadhi fresh clients**, tyanantar call-backs, mag baki. Call Desk madhe pan fresh pahile.
* Admin **Fresh Inbox** page: Before/After cutoff, kon "Gets clients" (Yes/No).
* Vel badlayachi aahe: `server/.env` -> `DISTRIBUTION_CUTOFF_HOUR=12` (24-tas, Asia/Kolkata).
* Database badal nahi - server chalu hotach sarv jhale.


---

## Navi sutvidha (v6)

**1. PC → mobile auto-open.** Mobile var CRM cha *konatahi* page ughda asel (Phone Mode ch pahije asa nahi) tar PC var **Call** dabaltach mobile aapoaap **Phone Mode** page var jato ani dial pad ughadto.
Navbar madhe (mobile top bar + PC var wara-var) ek lahan **📞 Call** button: mobile var → Phone Mode, PC var → Call Desk (hirva chhota thipka = mobile connected).
(Browser band asel / phone lock asel tar web page kahi karu shakat nahi - tyasathi Android app (`android-app/`) vapra.)

**2. WhatsApp message (remark-wise).** Call sampla ki "Call ended" pop-up madhe result nivadla (Interested / Not interested / Call back / No answer) ani **Save call** kela ki
lagech WhatsApp te client sathi tayar message ghewun ughadto - fakt **Send** dabaycha. Message pop-up madhe edit karta yeto.
* **Interested** → Welcome + WhatsApp group join link + executive cha swatacha **Zoom link**.
* **Not interested / Call back (vel sobat) / Not pickup** → vegvegle message.
* Admin: **WhatsApp Messages** page (sidebar) - char hi message ani group link badlu shakto. Placeholders: `{name} {executive} {zoom_link} {group_link} {callback_time}`.
* Zoom link: Admin → Executives → Edit, kinva executive swata: Account settings → *Zoom link* (kinva pop-up madhech). Zoom link nasel tar tya oli message madhun vagalya jatat.

**3. Executive cha "All Clients".** Executive la disate:
* **Swatache sarv clients**, ani
* **Sarv executives che Call back + Not pickup + Not interested clients** (shared pool) - konihi call karu shakto; call kela ki to client tyacha hoto (takeover).
* **Interested** client jyacha account **10 divsat open zala nahi** → to parat sarvanchya All Clients madhe yeto (`POOL_RETURN_DAYS`, default 10, `server/.env`).
* **Fresh** client (ajun ek hi call nahi) fakt tyachya executive la distat. Imported/fresh ani Interested clients tyachya executive kade rahatat (Interested 10 divsanantar pool madhe). Account opened clients konachya pool madhe yet nahit.
* Clients page madhe filter: *Whose → all / only my / shared pool*; pool chya client var "Call back / Not pickup / 10-day return" tag.
Database: `leads.interested_at`, `users.zoom_link`, `settings` table - server chalu hotach aapoaap jodle jatat (kahi import karaycha nahi).

**Update kasa karaycha:** juni folder var ha project overwrite kara, nantar `1-install.bat` (kinva `npm run build`) chalva - mag `2-start.bat`.


---

## Navi sutvidha (v7) - flow check + shared pool nemka

Sarva flow tapasla (PC→mobile auto-open, navbar Call button, remark-wise WhatsApp, Zoom link per executive, Call back / Not pickup / 10-divas pool) - to v6 madhe aadhich hota. Fakt ek badal:
* **Shared pool = Call back + Not pickup** (+ Interested jyacha account 10 divsat open zala nahi). **Not interested** aata fakt tyachya swatachya executive la distat.
  Junya pramane Not interested pan sarvanna dakhvaycha asel tar `server/.env` madhe `POOL_INCLUDE_NOT_INTERESTED=true` lava.

**Links kuthe bharaychi (manually, ekdach):**
| Link | Kuthe |
|---|---|
| WhatsApp group join link (sarvansathi ek) | Admin → **WhatsApp Messages** → *Group link* |
| Zoom link (pratyek executive chi vegli) | Admin → **Executives → Edit → Zoom link**, kinva executive swata: **Account settings → Zoom link**, kinva "Call ended" pop-up madhech |
| Message che text (Interested / Not interested / Call back / Not pickup) | Admin → **WhatsApp Messages** |

Update: juni folder var overwrite kara (node_modules thevun) → `2-start.bat`. `.env` madhe kahi badalaychi garaj nahi.


---

## Navi sutvidha (v8)

1. **Executive login kelya-kelya Inbox ughadto** (Dashboard nahi). *My Dashboard* menu madhe tasach aahe. Admin la Dashboard ch.
2. **Take button** - Executive → All Clients madhe dusrya executive cha (Call back / Not pickup / 10-divas return) client var **✋ Take** - call na karta to client swatacha hoto (Inbox madhe yeto). **Call** dabun pan take-over hoto.
3. **Response nahi → Call back.** Call jhalyavar client ne kahi response dila nahi / executive ne kahich select kele nahi (fresh client) → to aapoaap **Call back** (udya 11:00) madhe jato ani sarvanchya All Clients madhe disto. Aadhich result asalela client (Interested, Not interested...) badalat nahi.
4. **Zoom link edit:** Executive: sidebar → **🎥 My Zoom link (add / edit)**. Admin: **WhatsApp Messages** page chya khali pratyek executive samor box + Save (kinva Executives → Edit).
5. **WhatsApp group join link sarva message madhe** (Interested / Not interested / Call back / Not pickup). Admin → WhatsApp Messages madhe checkbox ne band karta yeto.

Database badal nahi - server chalu hotach sarv jhale. Update: juni folder var overwrite kara (node_modules thevun), `2-start.bat`.


---

## Navi sutvidha (v10) - Inbox

* Inbox → **Call-backs** page: aata **Call back + Not pickup + Not interested** sarv clients (swatache) distat - call back vel aleli pahile.
* Inbox → navin **Interested** page: swatache Interested clients (account open honyachi vaat baghat). Upar KPI madhe pan count.
* Sarvanche (shared pool) Call back / Not pickup clients **All Clients** madhe distat, tithun **Take** / **Call**.
#   c a l l i n g - c r m -  
 