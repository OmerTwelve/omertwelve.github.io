# Other Projects

## AI Therapist — mental health classification

AI Therapist is a mental health text classification system Omer built between
April 2026 and May 2026 at Cyprus International University. It fine-tunes a
DistilBERT transformer to classify mental health statements into seven
categories, and pairs the classifier with a FAISS semantic index so the system
can retrieve similar prior cases alongside its prediction.

## AI Therapist results and method

The fine-tuned DistilBERT model was trained on 42,000 mental health statements
and reached 82.7% validation accuracy with a 0.813 macro F1 across seven
categories. Omer built the full pipeline end to end: stratified data
preprocessing, transformer fine-tuning with early stopping, FAISS semantic
indexing for retrieval, and per-class evaluation. The stack was Python,
PyTorch, HuggingFace Transformers, FAISS and Streamlit.

## Omer's team leadership on AI Therapist

Omer led a team of four on AI Therapist. He planned the work, divided tasks
across the team, and coordinated deliverables across the full development
lifecycle. This is his clearest example of technical leadership rather than
solo work.

## Car Rental System — relational database project

The Car Rental System is a database project Omer built in May 2025. He designed
a normalized relational schema with explicit relationships between entities to
improve storage and retrieval efficiency. It included role-based access control
across three distinct user types — customers, employees and technical staff —
each with their own scoped privileges. The front end was a Tkinter desktop GUI
with full create, read, update and delete operations, backed by stored
procedures for automated workflows. The stack was SQL, Supabase, Python and
Tkinter, with Draw.io used for the entity-relationship diagram.

## This portfolio site and its RAG assistant

The portfolio site itself is one of Omer's builds. It is a hand-written static
site — no framework, no template, no build step — with an editorial design
system, a light and dark theme, and an animated EEG trace in the hero that
references NeuroSense. The assistant answering these questions is a retrieval
augmented generation system Omer built: a knowledge base is chunked and
embedded into vectors ahead of time, the visitor's question is embedded at
request time, the most relevant chunks are retrieved by cosine similarity, and
Claude generates an answer grounded in those chunks. The API key is held
server-side in a Cloudflare Worker, never in the browser.
