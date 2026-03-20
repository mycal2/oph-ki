# Supabase Auth Email Templates – OPH-KI by IDS.online

> Copy each HTML template into the corresponding Supabase Auth email template setting.
> Dashboard: Authentication → Email Templates

---

## 1. Invite User

**Subject:** `Sie wurden eingeladen – OPH-KI by IDS.online`

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Einladung – OPH-KI by IDS.online</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF4F6;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EEF4F6;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:8px;overflow:hidden;max-width:480px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background-color:#2E3538;padding:28px 32px;text-align:center;">
              <img src="https://oph-ki.ids.online/images/ids-logo-white.svg" alt="IDS.online" width="120" style="display:inline-block;vertical-align:middle;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 12px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#2E3538;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">Sie wurden eingeladen</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5D737E;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
                Sie wurden eingeladen, ein Konto auf <strong style="color:#2E3538;">OPH-KI by IDS.online</strong> zu erstellen. Klicken Sie auf den Button, um Ihre Einladung anzunehmen und Ihr Konto einzurichten.
              </p>
              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="border-radius:6px;background-color:#F39200;text-align:center;">
                    <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block;padding:14px 32px;color:#2E3538;font-size:15px;font-weight:700;text-decoration:none;border-radius:6px;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">Einladung annehmen</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#8F9CA3;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
                Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:
              </p>
              <p style="margin:0 0 24px;font-size:13px;line-height:1.5;color:#F39200;word-break:break-all;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
                {{ .ConfirmationURL }}
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #D8E1E5;text-align:center;">
              <p style="margin:0;font-size:12px;color:#8F9CA3;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">&copy; IDS.online &middot; OPH-KI</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 2. Reset Password

**Subject:** `Passwort zurücksetzen – OPH-KI by IDS.online`

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Passwort zurücksetzen – OPH-KI by IDS.online</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF4F6;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EEF4F6;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:8px;overflow:hidden;max-width:480px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background-color:#2E3538;padding:28px 32px;text-align:center;">
              <img src="https://oph-ki.ids.online/images/ids-logo-white.svg" alt="IDS.online" width="120" style="display:inline-block;vertical-align:middle;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 12px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#2E3538;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">Passwort zurücksetzen</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5D737E;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
                Wir haben eine Anfrage erhalten, das Passwort für Ihr Konto zurückzusetzen. Klicken Sie auf den Button, um ein neues Passwort zu vergeben.
              </p>
              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="border-radius:6px;background-color:#F39200;text-align:center;">
                    <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block;padding:14px 32px;color:#2E3538;font-size:15px;font-weight:700;text-decoration:none;border-radius:6px;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">Neues Passwort setzen</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#8F9CA3;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
                Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:
              </p>
              <p style="margin:0 0 24px;font-size:13px;line-height:1.5;color:#F39200;word-break:break-all;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
                {{ .ConfirmationURL }}
              </p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#8F9CA3;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
                Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren. Ihr Passwort bleibt unverändert.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #D8E1E5;text-align:center;">
              <p style="margin:0;font-size:12px;color:#8F9CA3;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">&copy; IDS.online &middot; OPH-KI</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 3. Email Confirmation

**Subject:** `E-Mail bestätigen – OPH-KI by IDS.online`

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>E-Mail bestätigen – OPH-KI by IDS.online</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF4F6;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EEF4F6;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:8px;overflow:hidden;max-width:480px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background-color:#2E3538;padding:28px 32px;text-align:center;">
              <img src="https://oph-ki.ids.online/images/ids-logo-white.svg" alt="IDS.online" width="120" style="display:inline-block;vertical-align:middle;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 12px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#2E3538;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">E-Mail-Adresse bestätigen</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5D737E;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
                Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihr Konto auf <strong style="color:#2E3538;">OPH-KI by IDS.online</strong> zu aktivieren.
              </p>
              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="border-radius:6px;background-color:#F39200;text-align:center;">
                    <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block;padding:14px 32px;color:#2E3538;font-size:15px;font-weight:700;text-decoration:none;border-radius:6px;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">E-Mail bestätigen</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#8F9CA3;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
                Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:
              </p>
              <p style="margin:0 0 24px;font-size:13px;line-height:1.5;color:#F39200;word-break:break-all;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
                {{ .ConfirmationURL }}
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #D8E1E5;text-align:center;">
              <p style="margin:0;font-size:12px;color:#8F9CA3;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">&copy; IDS.online &middot; OPH-KI</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 4. Magic Link

**Subject:** `Ihr Login-Link – OPH-KI by IDS.online`

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Login-Link – OPH-KI by IDS.online</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF4F6;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EEF4F6;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:8px;overflow:hidden;max-width:480px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background-color:#2E3538;padding:28px 32px;text-align:center;">
              <img src="https://oph-ki.ids.online/images/ids-logo-white.svg" alt="IDS.online" width="120" style="display:inline-block;vertical-align:middle;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 12px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#2E3538;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">Ihr Login-Link</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5D737E;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
                Nutzen Sie den folgenden Button, um sich direkt bei <strong style="color:#2E3538;">OPH-KI by IDS.online</strong> anzumelden. Der Link ist nur einmalig gültig.
              </p>
              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="border-radius:6px;background-color:#F39200;text-align:center;">
                    <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block;padding:14px 32px;color:#2E3538;font-size:15px;font-weight:700;text-decoration:none;border-radius:6px;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">Jetzt anmelden</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#8F9CA3;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
                Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:
              </p>
              <p style="margin:0 0 24px;font-size:13px;line-height:1.5;color:#F39200;word-break:break-all;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
                {{ .ConfirmationURL }}
              </p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#8F9CA3;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">
                Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #D8E1E5;text-align:center;">
              <p style="margin:0;font-size:12px;color:#8F9CA3;font-family:'Nunito Sans','Trebuchet MS',Arial,sans-serif;">&copy; IDS.online &middot; OPH-KI</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```
