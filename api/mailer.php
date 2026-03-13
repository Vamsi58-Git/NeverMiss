<?php
/**
 * mailer.php — Lightweight SMTP email helper for NeverMiss.
 * Uses PHP stream_socket_client (no Composer or third-party libs needed).
 * Supports SSL/TLS directly (Gmail port 465).
 *
 * Usage:
 *   require_once __DIR__ . '/mailer.php';
 *   send_email('user@example.com', 'Subject', 'HTML body here');
 */

require_once __DIR__ . '/email_config.php';

/**
 * Send an email via SMTP.
 *
 * @param string $to       Recipient email address.
 * @param string $subject  Email subject.
 * @param string $htmlBody HTML email body.
 * @return bool            True on success, false on failure.
 */
function send_email(string $to, string $subject, string $htmlBody): bool {
    if (!SMTP_ENABLED) {
        // Silently skip — not configured yet.
        return false;
    }

    $host     = SMTP_HOST;
    $port     = SMTP_PORT;
    $user     = SMTP_USER;
    $pass     = SMTP_PASS;
    $from     = SMTP_FROM;
    $fromName = SMTP_FROM_NAME;

    $errno  = 0;
    $errstr = '';

    $sock = @stream_socket_client("$host:$port", $errno, $errstr, 15);
    if (!$sock) {
        error_log("NeverMiss Mailer: Connection failed: $errstr ($errno)");
        return false;
    }

    // Helper to send SMTP command and read response.
    $cmd = function(string $c = '') use ($sock): string {
        if ($c !== '') fwrite($sock, "$c\r\n");
        return fgets($sock, 512);
    };

    $boundary = md5(uniqid());
    $date     = date('r');
    $toName   = $to;

    // Encode subject for UTF-8
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';

    $headers = implode("\r\n", [
        "Date: $date",
        "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <$from>",
        "To: <$to>",
        "Subject: $encodedSubject",
        "MIME-Version: 1.0",
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "X-Mailer: NeverMissPHP",
    ]);

    $body = base64_encode($htmlBody);
    // Wrap at 76 chars per RFC 2045
    $body = chunk_split($body, 76, "\r\n");

    $message = "$headers\r\n\r\n$body";

    try {
        $cmd();                        // read greeting
        $cmd("EHLO localhost");        // EHLO
        $cmd();                        // extra EHLO line
        $cmd();                        // extra
        $cmd();                        // extra
        $cmd("AUTH LOGIN");
        $cmd(base64_encode($user));
        $resp = $cmd(base64_encode($pass));

        if (strpos($resp, '235') === false) {
            error_log("NeverMiss Mailer: Auth failed: $resp");
            fclose($sock);
            return false;
        }

        $cmd("MAIL FROM:<$from>");
        $cmd("RCPT TO:<$to>");
        $cmd("DATA");
        fwrite($sock, "$message\r\n.\r\n");
        $endResp = $cmd();
        $cmd("QUIT");
        fclose($sock);

        if (strpos($endResp, '250') === false) {
            error_log("NeverMiss Mailer: Message rejected: $endResp");
            return false;
        }

        return true;

    } catch (\Throwable $e) {
        error_log("NeverMiss Mailer exception: " . $e->getMessage());
        fclose($sock);
        return false;
    }
}

/**
 * Build a styled HTML email template.
 *
 * @param string $title   Bold heading inside the card.
 * @param string $body    HTML content below the heading.
 * @return string         Complete HTML email string.
 */
function email_template(string $title, string $body): string {
    return <<<HTML
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f6ef;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f6ef;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#f59e0b,#3b82f6);padding:28px 32px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-0.5px;">NeverMiss</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:12px;">Opportunity Tracker</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 16px;color:#0f172a;font-size:18px;font-weight:800;">$title</h2>
            $body
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9f6ef;padding:16px 32px;border-top:1px solid #f1f5f9;">
            <p style="margin:0;color:#94a3b8;font-size:11px;">This is an automated message from NeverMiss. Do not reply to this email.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
HTML;
}
