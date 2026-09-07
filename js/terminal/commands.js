/**
 * omer-cli slash commands.
 *
 * These answer locally from constants — instant, and no API spend on "/help".
 * Only input that is *not* a command becomes a retrieval question.
 *
 * Each entry returns plain text; the caller renders it with textContent, so
 * nothing here can inject markup. To add a command, add it here — the help
 * text and tab-completion list are both derived from this object.
 */

export const COMMANDS = {
  "/whoami": {
    summary: "who Omer is, in one paragraph",
    run: () =>
      "Omer Ahmed — AI Engineering graduate, Abu Dhabi, UAE.\n\n" +
      "BSc Artificial Intelligence Engineering (Honours), Cyprus " +
      "International University. Works on real-time signal pipelines, models " +
      "that survive production, and the backends that keep them running. " +
      "Open to AI/ML engineering roles.",
  },

  "/projects": {
    summary: "the things he has built",
    run: () =>
      "NeuroSense — Real-Time EEG Stress Classification   [flagship]\n" +
      "  8-channel BCI at 250 Hz. Random Forest, 80.5% LOSO accuracy\n" +
      "  across 36 subjects. Python, FastAPI, React, scikit-learn.\n\n" +
      "AI Therapist — Mental Health Classification\n" +
      "  DistilBERT on 42K statements, 82.7% val accuracy, 0.813 macro\n" +
      "  F1. FAISS retrieval. Led a team of 4.\n\n" +
      "Car Rental System — Relational Database\n" +
      "  Normalized schema, role-based access control, Tkinter GUI.\n\n" +
      "Ask about any of them for detail.",
  },

  "/skills": {
    summary: "languages, frameworks, tools",
    run: () =>
      "Programming   Python, SQL, C++, C, C#\n" +
      "Frameworks    PyTorch, TensorFlow, scikit-learn, Pandas, NumPy,\n" +
      "              Matplotlib, React, FAISS\n" +
      "Tools         FastAPI, Docker, Git, REST APIs, Streamlit,\n" +
      "              Supabase, Arduino\n" +
      "Languages     Arabic (native), English (fluent)",
  },

  "/contact": {
    summary: "how to reach him",
    run: () =>
      "email      amory30900@hotmail.com\n" +
      "phone      +971 56 382 0738\n" +
      "github     github.com/OmerTwelve\n" +
      "linkedin   linkedin.com/in/omertwelve\n" +
      "location   Abu Dhabi, UAE (UTC+4)",
  },
};

/** Handled by the controller because they act on the terminal itself. */
export const CONTROL_COMMANDS = {
  "/clear": "clear the screen",
  "/exit": "close the terminal",
};

/** Every command name, for tab completion. */
export const COMMAND_NAMES = [
  "/help",
  ...Object.keys(COMMANDS),
  ...Object.keys(CONTROL_COMMANDS),
].sort();

/** /help is generated from the tables above so it can never drift out of date. */
export function helpText() {
  const entries = [
    ...Object.entries(COMMANDS).map(([name, c]) => [name, c.summary]),
    ...Object.entries(CONTROL_COMMANDS),
  ];
  const width = Math.max(...entries.map(([name]) => name.length)) + 4;

  return (
    "Commands\n" +
    entries.map(([name, s]) => `  ${name.padEnd(width)}${s}`).join("\n") +
    "\n\nAnything that isn't a command is treated as a question. It is " +
    "embedded, matched against Omer's notes by cosine similarity, and " +
    "answered by Claude from the retrieved chunks only."
  );
}
