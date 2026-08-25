import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy | ASFAI Education",
  description: "How ASFAI Education handles learner, classroom, and Google user data.",
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <p className="eyebrow">ASFAI Education</p>
      <h1>Privacy policy</h1>
      <p className="legal-updated">Effective August 24, 2026</p>

      <section>
        <h2>Our privacy model</h2>
        <p>
          ASFAI Education is designed so that a learner&apos;s detailed progress and schoolwork remain under
          that learner&apos;s or educator&apos;s control. The public ASFAI service supplies learning objectives,
          lesson guidance, and other public educational information. It does not require learner accounts
          and is not intended to retain individual learner profiles.
        </p>
      </section>

      <section>
        <h2>Information ASFAI may handle</h2>
        <ul>
          <li>Public learning-objective, lesson, and curriculum queries sent to the ASFAI service.</li>
          <li>
            Learner evidence, assessment claims, and lesson reports that a user chooses to save locally or
            in the user&apos;s authorized Solid Pod.
          </li>
          <li>
            Google Classroom course, assignment, submission, roster, and Drive-attachment information that
            a user expressly asks the installed ASFAI companion to read or update.
          </li>
          <li>OAuth account identifiers and authorization grants needed to maintain a requested connection.</li>
        </ul>
      </section>

      <section>
        <h2>Google user data</h2>
        <p>
          Google access is requested with the least privilege needed for the task. Classroom access defaults
          to read-only. Drive content is requested only when the user asks ASFAI to read attachment contents,
          and write access is requested only for a user-approved Classroom change. ASFAI uses Google data to
          identify selected courses and work, help evaluate that work against learning objectives, and carry
          out an export, submission, assignment, or grade action that the user explicitly confirms.
        </p>
        <p>
          The installed companion keeps Google OAuth tokens and raw Classroom work at the user&apos;s local device
          boundary. Those items are not sent to the shared public ASFAI MCP service. ASFAI does not sell Google
          user data, use it for advertising, or use it to train general-purpose AI models. It does not transfer
          Google user data except as needed to provide the user-requested function, comply with law, protect
          security, or save information to a destination the user chooses.
        </p>
        <p>
          ASFAI&apos;s use and transfer of information received from Google APIs adheres to the Google API Services
          User Data Policy, including its Limited Use requirements.
        </p>
      </section>

      <section>
        <h2>Storage, retention, and deletion</h2>
        <p>
          On supported Windows installations, reusable Google and Solid authorization records are encrypted
          for the current Windows user. A Google authorization remains available until the user asks ASFAI to
          forget it, removes the local application data, or revokes access through the Google Account. Imported
          work is used for the requested session and is not retained by the public service. A concise excerpt,
          summary, provider reference, or learning-evidence record is saved only when the user requests or
          approves that save.
        </p>
        <p>
          Users control records stored locally or in their Solid Pod and may edit or delete them there. Users
          can revoke Google access at any time from their Google Account permissions or by asking ASFAI to
          forget the Classroom authorization on that device.
        </p>
      </section>

      <section>
        <h2>Schools, families, and minors</h2>
        <p>
          Schools, teachers, parents, and guardians are responsible for obtaining any consent and authority
          required for student use and for following applicable education and student-privacy law. ASFAI should
          receive only the minimum student information needed for the educational task.
        </p>
      </section>

      <section>
        <h2>Security and contact</h2>
        <p>
          No system can guarantee absolute security. Please report privacy or security questions to{" "}
          <a href="mailto:mike@fenix.ai">mike@fenix.ai</a>.
        </p>
      </section>

      <nav className="legal-nav" aria-label="Legal pages">
        <Link href="/">ASFAI Education</Link>
        <Link href="/terms">Terms of service</Link>
      </nav>
    </main>
  );
}
