# פרסום לוח יהודי ב־Google Play וב־App Store

הקוד בנוי כך שהשרתים של GitHub בונים את שתי האפליקציות. אין צורך להתקין Android Studio או Xcode.
צריך רק להגדיר פעם אחת כמה "סודות" (Secrets) במאגר, ואז ללחוץ על כפתור.

איפה מגדירים סודות: במאגר ב־GitHub ← **Settings** ← **Secrets and variables** ← **Actions** ← **New repository secret**.

> **מזהה האפליקציה** ב־Google Play הוא `com.rooftopaistudio.luachyehudi`, וב־App Store `com.luachyehudi.app`. אחרי ההעלאה הראשונה אי אפשר לשנות אותו.
> כדי לבחור מזהה אחר, משנים אותו לפני ההעלאה הראשונה ב־`capacitor.config.ts`, ב־`android/app/build.gradle` (namespace ו־applicationId) וב־`ios/App/App.xcodeproj/project.pbxproj` (PRODUCT_BUNDLE_IDENTIFIER).

---

## אנדרואיד · Google Play

### 1. בדיקה בטלפון שלך, עוד לפני החנות
בכל דחיפה של קוד רץ הבילד **Android app** (בלשונית Actions במאגר).
בסיום הריצה, תחת **Artifacts**, מורידים את `test-apk` ומתקינים את הקובץ בטלפון.
אנדרואיד יבקש לאשר "התקנה ממקור לא ידוע".

### 2. מפתח החתימה (Upload key)
Google Play מקבל רק קובץ ‎.aab חתום. קיבלת ממני קובץ מפתח (`luachi-upload.jks`) וקובץ עם הסיסמאות.
- **שמור עותק של שניהם במקום בטוח**, למשל במנהל סיסמאות או בדרייב פרטי. אל תעלה אותם למאגר.
- זה "מפתח העלאה" בלבד. את המפתח הסופי של האפליקציה Google שומר (Play App Signing). אם מפתח ההעלאה אובד, אפשר לבקש מ־Google לאפס אותו.

מוסיפים ארבעה סודות:

| שם הסוד | ערך |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | כל התוכן של הקובץ `luachi-upload.jks.base64.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | מתוך `secrets.txt` |
| `ANDROID_KEY_PASSWORD` | מתוך `secrets.txt` (אותה סיסמה) |
| `ANDROID_KEY_ALIAS` | `luachi-upload` |

מעכשיו כל ריצה של **Android app** מייצרת גם את `play-bundle`, כלומר את הקובץ `app-release.aab`.

### 3. יצירת האפליקציה ב־Play Console
1. **Create app**. שם: **לוח יהודי**. שפת ברירת מחדל: עברית. סוג: App. מחיר: חינם.
2. **App content**:
   - Privacy policy: `https://pini236.github.io/hebrew-calendar/privacy.html`
   - Ads: לא.
   - Data safety: לא נאסף ולא משותף מידע.
   - Content rating: לענות על השאלון, והתוצאה תהיה "לכל הגילים".
   - Target audience: ‎13+‎.
3. **Store listing**: הטקסטים נמצאים ב־`store/listing.md`, צילומי המסך ב־`store/screenshots/android-*.png`, תמונת הנושא ב־`store/screenshots/play-feature-graphic.png`, והאייקון בגודל 512×512 ב־`store/play-icon-512.png`.
4. **Testing ← Internal testing ← Create release**: מעלים את `app-release.aab`, מוסיפים את עצמך כבודק, ומתקינים מהקישור שמתקבל.

> **חשוב:** חשבון מפתח פרטי שנפתח אחרי נובמבר 2023 חייב להריץ קודם **Closed testing** עם לפחות 12 בודקים במשך 14 יום, ורק אחר כך מקבל גישה ל־Production. חשבון של ארגון פטור מזה.

### 4. העלאה אוטומטית (לא חובה)
אחרי ההעלאה הידנית הראשונה אפשר לתת ל־GitHub להעלות לבד:
1. יוצרים Service Account ב־Google Cloud, מוסיפים אותו ב־Play Console תחת **Users and permissions** עם הרשאת Release, ומורידים קובץ JSON.
2. מוסיפים סוד `PLAY_SERVICE_ACCOUNT_JSON` עם התוכן של קובץ ה־JSON.
3. ב־Actions ← **Android app** ← **Run workflow** מסמנים "Upload … to Google Play". הגרסה עולה למסלול Internal testing.

מספר הגרסה (versionCode) עולה אוטומטית בכל ריצה.

---

## אייפון · App Store

הבנייה רצה על מחשב Mac בענן של GitHub, וההעלאה ל־App Store Connect היא אוטומטית. משם האפליקציה מגיעה ל־TestFlight.

### 1. מפתח API של App Store Connect
1. App Store Connect ← **Users and Access** ← **Integrations** ← **App Store Connect API** ← **Team Keys** ← **+**.
2. שם: GitHub. הרשאה: **Admin**. הרשאת Admin נדרשת כדי ש־Xcode יוכל ליצור אישור הפצה (certificate) בענן.
3. מורידים את קובץ ה־‎.p8. **אפשר להוריד אותו רק פעם אחת.**
4. רושמים את **Key ID** ואת **Issuer ID**. שניהם מופיעים באותו עמוד.
5. את **Team ID** מוצאים ב־developer.apple.com ← Account ← Membership details.

| שם הסוד | ערך |
|---|---|
| `APPLE_TEAM_ID` | ה־Team ID (10 תווים) |
| `ASC_KEY_ID` | ה־Key ID |
| `ASC_ISSUER_ID` | ה־Issuer ID |
| `ASC_KEY_P8` | כל התוכן של קובץ ה־‎.p8, כולל השורות BEGIN ו־END |

### 2. רישום האפליקציה
1. developer.apple.com ← **Certificates, IDs & Profiles** ← **Identifiers** ← **+** ← App IDs. Bundle ID: `com.luachyehudi.app`. לא צריך לסמן Capabilities.
2. App Store Connect ← **Apps** ← **+** ← New App. פלטפורמה: iOS. שם: **לוח עברי**. כותרת משנה (Subtitle): לוח יהודי. שפה ראשית: Hebrew. Bundle ID: `com.luachyehudi.app`. SKU: `luach-ivri`.

### 3. בנייה והעלאה
ב־Actions ← **iOS app** ← **Run workflow**.
הבנייה לוקחת כ־10 עד 15 דקות. אחר כך Apple מעבדת את הגרסה עוד 10 עד 30 דקות, והיא מופיעה ב־**TestFlight**.
מוסיפים את עצמך ואת אשתך כבודקים פנימיים (Internal Testing), והיא מתקינה דרך אפליקציית TestFlight באייפון.

> את הבילד הזה בניתי בלי גישה למחשב Mac, ולכן הוא עוד לא נבדק בפועל. אם הריצה הראשונה נכשלת, תשלח לי את הקישור לריצה ואתקן.

### 4. הגשה לחנות
באפליקציה ב־App Store Connect:
- **App Privacy**: Data Not Collected.
- **Privacy Policy URL**: `https://pini236.github.io/hebrew-calendar/privacy.html`
- צילומי מסך: `store/screenshots/ios-*.png`, בגודל 1320×2868 (iPhone 6.9").
- טקסטים: `store/listing.md`.
- **Age Rating**: עונים על השאלון, ובכל השאלות התשובה היא None.
- בוחרים את הבילד מ־TestFlight ← **Submit for Review**.

---

## מתי לבנות מחדש
- **אנדרואיד**: בכל דחיפה לקוד, אוטומטית.
- **אייפון**: לוחצים Run workflow, או דוחפים תגית `v1.0.1` וכן הלאה.
- לפני כל בילד רצה בדיקת הדיוק (`npm run verify`). אם זמן כלשהו לא תואם לספרייה השנייה, הבילד נכשל ושום דבר לא עולה לחנות.
