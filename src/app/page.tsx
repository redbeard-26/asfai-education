import EducationClient from "./EducationClient";

export default function Page() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">American Society for AI</p>
        <h1>ASFAI Education</h1>
        <p className="lede">
          Explore an open learning-objective graph while keeping learner progress under the learner's control.
        </p>
      </section>
      <EducationClient />
    </main>
  );
}
