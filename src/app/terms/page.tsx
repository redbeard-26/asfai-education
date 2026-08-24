import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms | ASFAI Education",
  description: "Terms governing use of ASFAI Education.",
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <p className="eyebrow">ASFAI Education</p>
      <h1>Terms of service</h1>
      <p className="legal-updated">Effective August 24, 2026</p>

      <section>
        <h2>Using ASFAI Education</h2>
        <p>
          ASFAI Education provides open-source educational software, public learning-objective information,
          AI-assisted lesson and assessment workflows, and optional connections to user-controlled storage
          and classroom services. By using the hosted service or an installed ASFAI companion, you agree to
          these terms and the privacy policy.
        </p>
      </section>

      <section>
        <h2>Your accounts, content, and permissions</h2>
        <p>
          You remain responsible for your Google, Solid, school, and other third-party accounts. You must have
          authority to access, evaluate, save, share, submit, grade, or modify any student work or classroom
          information you ask ASFAI to handle. You retain your rights in content you provide. You authorize
          ASFAI to process that content only as needed to perform the functions you request.
        </p>
      </section>

      <section>
        <h2>Educational judgment</h2>
        <p>
          AI-generated lessons, feedback, evaluations, and mastery claims can be incomplete or incorrect.
          Teachers, learners, parents, and schools must review important educational decisions. ASFAI does not
          replace a qualified teacher, school policy, individualized education plan, or professional advice.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>
          Do not use ASFAI to violate law, school policy, intellectual-property rights, privacy rights, or
          another person&apos;s account security. Do not attempt to obtain work or records you are not authorized
          to access, bypass provider safeguards, introduce malicious content, or interfere with the service.
        </p>
      </section>

      <section>
        <h2>Third-party services</h2>
        <p>
          Google Classroom, Google Drive, Solid Pods, curriculum sources, and other connected services are
          governed by their own terms and availability. ASFAI is not responsible for changes, interruptions,
          or actions by those providers. A user may disconnect a provider at any time.
        </p>
      </section>

      <section>
        <h2>Availability and warranty</h2>
        <p>
          The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis to the extent permitted by law.
          ASFAI makes no guarantee that the service will be uninterrupted, error-free, or suitable for a
          particular educational decision. Open-source components remain subject to their published licenses.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          These terms may be updated as ASFAI&apos;s services change. The effective date above identifies the
          current version. Questions may be sent to <a href="mailto:mike@fenix.ai">mike@fenix.ai</a>.
        </p>
      </section>

      <nav className="legal-nav" aria-label="Legal pages">
        <Link href="/">ASFAI Education</Link>
        <Link href="/privacy">Privacy policy</Link>
      </nav>
    </main>
  );
}
