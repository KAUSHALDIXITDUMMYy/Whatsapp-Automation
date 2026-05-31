import LegalLayout from "../layout/LegalLayout";

export default function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="May 31, 2026">
      <p>
        This Privacy Policy explains how Cable CRM (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;)
        collects, uses, and protects information when you use our subscriber management and WhatsApp
        automation platform (&quot;Service&quot;). It applies to vendor (business) users of the
        platform and describes how we handle data on your behalf.
      </p>

      <h2>1. Roles</h2>
      <ul>
        <li>
          <strong>Vendor users</strong> (cable operators and similar businesses) are our customers.
          You decide what subscriber data to upload and when to message customers.
        </li>
        <li>
          <strong>Subscribers / end customers</strong> are your customers. You are responsible for
          telling them how their data is used and obtaining consent for WhatsApp communication.
        </li>
      </ul>

      <h2>2. Information we collect</h2>
      <h3>Account information (vendors)</h3>
      <ul>
        <li>Business name, email, password (stored hashed), subscription tier and expiry.</li>
        <li>Settings such as billing cycle, appointment slots, and automation preferences.</li>
      </ul>
      <h3>Subscriber data (on your instructions)</h3>
      <ul>
        <li>Name, phone number, joining date, recharge/due dates, tags, and custom fields you provide.</li>
        <li>CSV import mappings and saved import templates.</li>
      </ul>
      <h3>Messaging and activity data</h3>
      <ul>
        <li>Outbound and inbound WhatsApp message content, delivery status, timestamps, and errors.</li>
        <li>Technician visit and call-request records created through WhatsApp flows.</li>
        <li>Reminder rules and dispatch logs for billing notifications.</li>
      </ul>
      <h3>Technical data</h3>
      <ul>
        <li>Server logs (IP address, request time, browser type) for security and troubleshooting.</li>
        <li>Authentication tokens stored in your browser local storage when you log in.</li>
      </ul>

      <h2>3. How we use information</h2>
      <p>We use data to:</p>
      <ul>
        <li>Provide and operate the Service (CRM, imports, chats, visits, reminders).</li>
        <li>Send WhatsApp messages you configure (welcome, recharge reminders, session replies).</li>
        <li>Authenticate users and enforce subscription access.</li>
        <li>Maintain security, prevent abuse, and comply with legal obligations.</li>
        <li>Improve reliability and support (aggregated or anonymized where possible).</li>
      </ul>
      <p>We do not sell subscriber phone numbers or message content to third parties for advertising.</p>

      <h2>4. WhatsApp and Meta</h2>
      <p>
        Messages are transmitted through Meta&apos;s WhatsApp Business Platform. Meta processes
        message delivery according to its own privacy policy and terms. We share with Meta only
        what is necessary to send and receive messages (e.g., phone numbers, template names, message
        body or template parameters). Meta may also send us delivery and read receipts via webhooks.
      </p>

      <h2>5. Service providers</h2>
      <p>We may use trusted providers to host and run the Service, such as:</p>
      <ul>
        <li>Cloud hosting and database providers.</li>
        <li>Redis/queue infrastructure for message processing.</li>
        <li>Frontend hosting (e.g., Vercel) for the web application.</li>
      </ul>
      <p>
        These providers process data only to deliver the Service and under contractual confidentiality
        and security obligations.
      </p>

      <h2>6. Data retention</h2>
      <p>
        We retain vendor and subscriber data while your account is active and as needed to provide
        the Service, resolve disputes, and meet legal requirements. Message logs may be retained for
        operational and compliance purposes. You may request deletion of your vendor account subject
        to legal and backup retention limits.
      </p>

      <h2>7. Security</h2>
      <p>
        We use industry-standard measures including encrypted connections (HTTPS), hashed passwords,
        tenant isolation by vendor ID, and access controls. No method of transmission or storage is
        100% secure; you must protect your account credentials.
      </p>

      <h2>8. Your choices and rights</h2>
      <ul>
        <li>Vendors can access, update, and delete subscriber records through the dashboard.</li>
        <li>Vendors can disable welcome automation and reminder rules in Settings.</li>
        <li>
          End customers should contact <strong>you</strong> (their cable operator) to exercise privacy
          rights regarding their subscriber data; we assist vendors in responding where required by law.
        </li>
      </ul>
      <p>
        Depending on applicable law (including India&apos;s Digital Personal Data Protection Act where
        relevant), individuals may have rights to access, correction, or deletion. Contact your vendor
        or platform operator to submit requests.
      </p>

      <h2>9. International transfers</h2>
      <p>
        Data may be processed on servers or databases located outside your country (for example,
        cloud regions used by our hosting or database providers). We take steps to ensure appropriate
        safeguards where required.
      </p>

      <h2>10. Children</h2>
      <p>
        The Service is not directed at children under 18. Business accounts must not knowingly collect
        children&apos;s personal data without parental consent and lawful basis.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. The &quot;Last updated&quot; date at the
        top reflects the latest version. Continued use after changes constitutes acknowledgment where
        permitted by law.
      </p>

      <h2>12. Contact</h2>
      <p>
        For privacy questions about Cable CRM, contact the platform operator or your account
        administrator. End customers should contact their service provider (vendor) first regarding
        subscriber data.
      </p>
    </LegalLayout>
  );
}
