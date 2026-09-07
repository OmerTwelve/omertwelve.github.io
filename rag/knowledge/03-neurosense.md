# NeuroSense — Real-Time EEG Stress Classification

## What NeuroSense is

NeuroSense is Omer's senior capstone project, built between January 2026 and
June 2026 at Cyprus International University. It is a complete brain-computer
interface that detects psychological stress from live EEG brain signals. Raw
8-channel scalp voltages come off an OpenBCI Cyton board, stream at 250 Hz
through a digital signal processing pipeline, and drive both a classical stress
index and a trained machine learning classifier, all rendered live in a React
dashboard. It is Omer's flagship project.

## The NeuroSense architecture

The system is three separate processes. A hardware bridge talks to the OpenBCI
WiFi shield and forwards samples; a FastAPI backend does all signal processing
and inference; a React dashboard displays the results over a WebSocket. All
signal processing and ML inference happen in the backend — the frontend only
renders pre-computed data. That split is deliberate and mirrors the MATLAB
reference pipeline the design was validated against.

## The machine learning model in NeuroSense

The deployed model is a Random Forest classifier trained on 40 band-power
features, which is 5 frequency bands across 8 EEG channels. It achieves 80.5%
leave-one-subject-out (LOSO) accuracy across 36 subjects, with a mean F1 of
0.608. Features are normalized per subject against that person's own captured
resting baseline rather than a global scaler, which is what makes the model
transfer across people.

## Why Omer chose Random Forest over a CNN for NeuroSense

Omer trained and compared three models under leave-one-subject-out evaluation.
Logistic Regression reached 0.764 accuracy and 0.583 mean F1. Random Forest
reached 0.805 accuracy and 0.608 F1 and was deployed. An EEGNet-style CNN
reached only 0.739 accuracy and roughly 0.41 F1, with 12 of 36 folds scoring
F1 of 0.000 and a train/validation accuracy gap of 0.16 indicating overfitting.
The CNN underperformed because roughly 1,400 windows across 36 subjects is not
enough data for a model that must learn its own spatial and temporal filters
from raw signal, whereas hand-crafted band-power features encode that domain
knowledge for free.

## How Omer reports NeuroSense results honestly

The majority-class baseline — always predicting "relaxed" — scores 71.4% on
the evaluation split, which had 20 relaxed to 8 stressed windows per subject.
Omer reports the Random Forest's 80.5% as a real but modest margin above that
floor, not a dramatic one, and reports F1 alongside accuracy because several
LOSO folds for every model score F1 of 0.000, meaning the model predicted the
majority class for that entire held-out subject.

## The signal processing pipeline in NeuroSense

Incoming EEG is bandpass filtered from 1 to 40 Hz and notch filtered at 50 Hz,
using stateful filters that hold per-channel state so filtering is continuous
across chunks rather than restarting each time. Artifacts are rejected on
amplitude and variance thresholds. Band power is computed with a Welch power
spectral density estimate over a 10-second window, giving relative power in
five bands: delta, theta, alpha, beta and gamma.

## The classical stress index in NeuroSense

Alongside the ML classifier, NeuroSense computes a DSP stress index: the mean
log frontal beta power minus the mean log parietal alpha power, z-scored
against a 60-second resting baseline the user captures manually. A z-score
below 1.0 reads as relaxed, 1.0 to 2.0 as moderate, and 2.0 or above as high
stress. Both the DSP index and the ML prediction are shown on the dashboard —
the ML model runs alongside the classical method rather than replacing it.

## The hardware behind NeuroSense

The rig is a single OpenBCI Cyton board with a WiFi shield, 8 channels at a
native 250 Hz sample rate, no Daisy expansion module. Electrodes sit at Fp1,
Fp2, C3, C4, F3, F4, P3 and P4, with earclip electrodes providing the reference
and driven ground. The shield streams raw 33-byte binary packets over TCP,
which Omer's bridge parses directly — the firmware ignores requests for JSON
output, so he wrote the binary parser himself.

## Hard-won debugging lessons from NeuroSense

Several failures in NeuroSense were silent rather than loud, and Omer
documented each one. The board must be sent a channel-configuration command
before every streaming session or it outputs a constant railed value on all
channels while still looking connected. The sample rate constant must match the
hardware exactly — a wrong value produces no error but shifts every frequency
and corrupts band power and the stress index by roughly 2x. The electrode
channel order had to be verified against the physical wiring rather than
assumed, because an earlier version had two pairs swapped and silently computed
the stress index from the wrong scalp sites.

## Preventing silent model failure in NeuroSense

Training and live inference share one feature-extraction module rather than
each having their own copy, so the two cannot drift apart. The exact feature
column order is saved into the model metadata file and enforced at prediction
time. Recorded data is saved already filtered, so the training pipeline must
not filter again — double-filtering would make training diverge from inference.
These are guards against the class of bug that produces confident wrong
predictions instead of a crash.

## The dataset behind NeuroSense and its limitations

The deployed model is trained on the 36-subject PhysioNet EEGMAT dataset. Omer
is explicit that this leaves a hardware domain gap: the training data came from
a 23-channel clinical Neurocom system, while the deployed system runs on an
OpenBCI Cyton — different amplifier, reference scheme and electrodes. His own
8 recorded subjects were excluded because a duplicate stream-start bug in an
earlier bridge version doubled their sample counts and corrupted the timing,
causing every window to fail artifact rejection. He documented the diagnosis
and wrote a repair script rather than loosening the thresholds to hide it.

## The technology stack of NeuroSense

Python for the backend, FastAPI for the server, WebSockets for live transport,
NumPy and SciPy for signal processing, scikit-learn for the models, PyTorch for
the CNN comparison, React for the dashboard, and OpenBCI Cyton hardware for
acquisition. A MATLAB reference implementation was used to validate the
pipeline design.
