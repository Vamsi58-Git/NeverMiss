<?php
/**
 * email_config.php — SMTP credentials for NeverMiss email notifications.
 *
 * HOW TO SET UP (Gmail):
 * 1. Go to https://myaccount.google.com/security
 * 2. Enable 2-step verification if not already done.
 * 3. Search for "App Passwords" → create one for "Mail".
 * 4. Paste that 16-character app password into SMTP_PASS below.
 * 5. Change SMTP_FROM to your Gmail address.
 */

define('SMTP_HOST',     'ssl://smtp.gmail.com');
define('SMTP_PORT',     465);
define('SMTP_USER',     'your_email@gmail.com');   // ← change this
define('SMTP_PASS',     'your_app_password_here'); // ← change this (Gmail App Password)
define('SMTP_FROM',     'your_email@gmail.com');   // ← same as SMTP_USER
define('SMTP_FROM_NAME','NeverMiss');
define('SMTP_ENABLED',  false); // ← set to true once credentials are filled in
