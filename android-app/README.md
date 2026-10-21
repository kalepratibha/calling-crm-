# CRM Dialer (Android)

PC var **Call** dabla ki ya phone cha **dial pad number sathi ughadto**. Call sampli ki **PC var "Call ended" popup** yeto, exact duration sobat.
Server madhe badal nahi lagat — tochya `/api/phone/*` endpoints varun chalte (aadhi pasun ahet).

## APK kasa banvaycha (2 paryay)

### A) Android Studio (Windows)
1. Android Studio install kara (https://developer.android.com/studio).
2. **Open** -> `calling-crm\android-app` folder nivda. Gradle sync hou dya (pahilyanda internet lagto).
3. Menu **Build -> Build Bundle(s)/APK(s) -> Build APK(s)**. APK: `android-app\app\build\outputs\apk\debug\app-debug.apk`.
4. APK phone var pathva (WhatsApp/USB), install kara ("Install unknown apps" allow kara).

### B) GitHub (Android Studio nako asel tar)
1. `android-app` folder cha content navya GitHub repo madhe upload kara.
2. Actions -> **Build APK** -> Run workflow. Sampla ki **crm-dialer-apk** artifact download kara (app-debug.apk).

## Phone var setup (ekda)
1. App ughada. Server address: `http://192.168.1.109:5000` (PC cha IP, same Wi-Fi).
2. Mobile number + password = PC var jyane login kelay tech. **Sign in & Start**.
3. Buttons 1, 2, 3 dabun permissions dya:
   - **Phone state** (call sampli he kalnyasathi) + Notifications
   - **Display over other apps** (app background madhe astana dial pad aapoaap ughadnyasathi)
   - **Do not optimise battery** (app band hou naye)
4. Notification "CRM Dialer - Connected" disat rahila pahije.

## Vaparne
PC: client var **Call** -> phone var dial pad number sobat ughadto -> hirva call button daba -> bola -> call cut kara -> PC var popup + duration.
Dial pad aapoaap nahi ughadla tar notification var tap kara (tithe number disto).
Phone restart nantar app aapoaap chalu hoto (sign-in rahila tar).
