# Privacy-Preserving Edge-Cloud Orchestration for Streaming Audio Transcription and Conversational AI in Healthcare

---

## 1. Executive Summary & Problem Statement

The adoption of conversational AI, voice-driven triage, and real-time medical dictation promises to dramatically reduce clinical administrative burden. However, deploying streaming voice architectures in production creates an unavoidable trade-off between **patient data privacy (HIPAA/GDPR compliance)** and **real-time processing latency**.

### Core Risks

- **Privacy risk:** Streaming raw audio containing Protected Health Information (PHI)—such as patient names, medical record numbers, and vocal identity biometrics—to external multi-tenant cloud Speech-to-Text (STT) and Large Language Model (LLM) APIs creates significant regulatory and compliance vulnerabilities.
- **Latency constraints:** Clinical voice applications (for example real-time phone intake or live doctor-patient transcription) demand sub-second or near-real-time feedback. Processing end-to-end Whisper transcription and LLM inference locally on resource-constrained clinic hardware introduces unacceptable processing bottlenecks.
- **Vocal biometric leakage:** Beyond verbal text content, raw audio carries acoustic features (pitch, timbre, cadence) that function as biometric identifiers, exposing speaker identity even if verbal names are omitted.

### Conceptual Positioning

Raw cloud streaming is fast but leaky. Fully local inference is private but slow. The hybrid edge-cloud pipeline is designed to occupy the high-privacy, low-latency quadrant.

```mermaid
quadrantChart
    title Privacy vs latency (conceptual)
    x-axis High latency --> Low latency
    y-axis Low privacy --> High privacy
    quadrant-1 Hybrid target
    quadrant-2 Local-only Whisper
    quadrant-3 Unacceptable
    quadrant-4 Raw cloud streaming
    Raw Cloud STT: [0.85, 0.18]
    Local Whisper: [0.18, 0.85]
    Hybrid Pipeline: [0.78, 0.82]
```

### Proposed Solution

This research proposes a **Hybrid Edge-Cloud Audio Pipeline** that decouples acoustic privacy transformation from high-accuracy speech transcription and downstream reasoning. By combining lightweight local audio feature anonymization, streaming Named Entity Recognition (NER), and token-surrogation models at the edge, raw audio is sanitized before it reaches cloud LLM inference engines.

```mermaid
flowchart LR
    subgraph problem [Production constraint]
        P1[Raw PHI audio]
        P2[Cloud STT and LLM APIs]
        P1 -->|identity and PHI leak| P2
        P1 -->|local-only inference| P3[Clinic hardware bottleneck]
    end

    subgraph solution [Hybrid pipeline]
        S1[Edge anonymization]
        S2[Surrogate tokens]
        S3[Cloud ASR and clinical LLM]
        S1 --> S2 --> S3
        S3 -->|placeholders only| S4[Clinician UI restore]
    end

    problem --> solution
```

---

## 2. Research Objectives & System Architecture

### Key Research Objectives

1. **Develop an edge-assisted audio anonymization pipeline.** Design a lightweight local transformation engine that strips speaker voice biometrics (via pseudo-speaker acoustic embedding substitution) and redacts audio-based PHI prior to cloud transmission.
2. **Minimize end-to-end streaming latency.** Benchmark real-time audio chunking, WebSocket streaming, and asynchronous event-loop performance to maintain sub-1.5-second processing latency.
3. **Quantify accuracy vs. privacy trade-offs.** Systematically measure Word Error Rate (WER) and downstream LLM clinical insight extraction degradation when operating over anonymized/surrogated audio inputs versus raw audio controls.

```mermaid
flowchart TB
    O1[Objective 1: Edge anonymization]
    O2[Objective 2: Sub-1.5s latency]
    O3[Objective 3: Accuracy vs privacy]

    O1 --> M1[Speaker EER increase]
    O2 --> M2[p50 and p99 round-trip]
    O3 --> M3[WER and CER vs raw audio]
```

### System Architecture

PHI never leaves the clinic in recoverable form. The edge device strips voice biometrics, substitutes identifiers, and streams only anonymized audio plus surrogate tokens. Cloud services transcribe and reason over sanitized input. The clinician UI restores original names locally.

```mermaid
flowchart TB
    subgraph edge [Client / Edge application]
        mic["Live microphone<br/>16kHz PCM stream"]
        vad[VAD and audio chunking]
        subgraph anon [Edge anonymization engine]
            acoustic[Acoustic disentanglement]
            ewhisper[Edge Whisper Tiny/Base]
            ner[Streaming clinical NER]
        end
        tokens["PHI token surrogation<br/>John Doe to PATIENT_01"]
        wsOut[Encrypted WebSocket payload]
        mic --> vad --> anon
        acoustic --> wsOut
        ewhisper --> ner --> tokens --> wsOut
    end

    subgraph cloud [Cloud backend and AI services]
        orch[Async FastAPI orchestrator]
        asr[Cloud STT Whisper Large-v3]
        llm[Clinical LLM inference]
        orch --> asr --> llm
    end

    subgraph ui [Clinician dashboard]
        recv[Receive surrogate payload]
        restore[Local mapping swap]
        report[Restored clinical report]
        recv --> restore --> report
    end

    wsOut -->|TLS WebSocket| orch
    llm -->|placeholders only| recv
```

### End-to-End Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Clinician
    participant Mic as Microphone
    participant Edge as Edge engine
    participant Map as Local PHI map RAM
    participant Cloud as Cloud orchestrator
    participant ASR as Whisper Large-v3
    participant LLM as Clinical LLM
    participant UI as Dashboard

    Clinician->>Mic: Speak during encounter
    Mic->>Edge: 16kHz PCM chunks
    Edge->>Edge: VAD, strip silence, 1s windows
    Edge->>Edge: Replace speaker x-vector with pseudo-speaker
    Edge->>Edge: Local Whisper Tiny/Base plus clinical NER
    Edge->>Map: Store PATIENT_01 to original name
    Edge->>Cloud: Encrypted anonymized audio plus surrogates
    Cloud->>ASR: High-accuracy transcription
    ASR->>LLM: Transcript with placeholders
    LLM->>Cloud: SOAP note / triage with PATIENT_01
    Cloud->>UI: Sanitized clinical payload
    UI->>Map: Resolve placeholders
    Map-->>UI: Original patient values
    UI->>Clinician: Restored report
    Note over Map: Mapping cleared on session close
```

---

## 3. Detailed Methodology & Implementation Strategy

### A. Edge-Side Audio Processing & Anonymization

- **Chunking & VAD:** Incoming 16kHz mono audio streams pass through a local Voice Activity Detection (VAD) engine to strip silent segments and package audio into fixed 1-second chunks.
- **Acoustic disentanglement (voice anonymization):** To prevent biometric re-identification, the local edge engine extracts acoustic features (f0 pitch, formants) and linguistic bottleneck features using a lightweight neural acoustic model. The original speaker's x-vector identity embedding is replaced with a pseudo-speaker embedding before streaming to cloud services.
- **Local PHI token surrogation:** A lightweight local model identifies vocalized names, dates, and locations, generating a temporary local lookup dictionary (`PATIENT_01` → original name) stored exclusively in the edge device's RAM.

```mermaid
flowchart LR
    A[16kHz mono stream] --> B[VAD]
    B --> C[1-second chunks]
    C --> D[Acoustic feature extract]
    D --> E[Swap speaker x-vector]
    C --> F[Edge Whisper Tiny/Base]
    F --> G[Clinical NER]
    G --> H[Surrogate dictionary in RAM]
    E --> I[Anonymized audio]
    H --> J[Token payload]
    I --> K[Encrypted WebSocket]
    J --> K
```

### B. High-Throughput Cloud Orchestration

- **Asynchronous backend architecture:** Build a FastAPI and WebSocket microservice pipeline deployed on containerized cloud infrastructure (Docker, AWS EC2/S3).
- **ASR & LLM workflow:** Cloud nodes process incoming anonymized audio chunks using high-capacity ASR engines (Whisper Large-v3) to generate raw text transcripts, which are then passed to clinical LLM agents (AWS Bedrock, OpenAI) for structured insight extraction, SOAP note generation, and triage categorization.

```mermaid
flowchart LR
    WS[WebSocket ingest] --> Q[Async event queue]
    Q --> ASR[Whisper Large-v3]
    ASR --> TXT[Transcript with surrogates]
    TXT --> LLM[Bedrock / GPT clinical agent]
    LLM --> OUT[SOAP note and triage]
    OUT --> RESP[Return placeholders only]
```

### C. Client-Side Re-identification & Security

- **Zero-trust restoration:** The cloud returns the clinical summary containing surrogate markers (`PATIENT_01`).
- **DOM-level restoration:** The clinician's authenticated frontend application receives the payload and replaces surrogates with original patient values using the local mapping table. The mapping table is cleared from memory upon session closure.

```mermaid
stateDiagram-v2
    [*] --> Capture: Encounter starts
    Capture --> Anonymize: Edge VAD and NER
    Anonymize --> CloudBound: PHI map lives only in RAM
    CloudBound --> Restore: Cloud returns placeholders
    Restore --> Display: UI swaps local names
    Display --> [*]: Session close wipes map
```

---

## 4. Evaluation & Benchmarking Metrics

The proposed system will be rigorously evaluated across three performance axes:

| Evaluation axis | Metric / tool | Target benchmark |
| --- | --- | --- |
| **Privacy & anonymization** | Equal Error Rate (EER) via Automatic Speaker Verification (ASV) | > 25% EER increase (successful speaker identity concealment) |
| **Transcription accuracy** | Word Error Rate (WER) and Concept Error Rate (CER) | < 8% WER on real-world clinical audio streams |
| **System performance** | Latency (p50, p99), throughput, RAM/CPU load | < 1,500 ms total round-trip latency over WebSockets |

```mermaid
flowchart TB
    subgraph privacy [Privacy]
        ASV[Automatic Speaker Verification]
        EER[Target: greater than 25% EER increase]
        ASV --> EER
    end

    subgraph accuracy [Accuracy]
        WER[Word Error Rate]
        CER[Concept Error Rate]
        WER --> T1[Target: WER under 8%]
        CER --> T1
    end

    subgraph perf [Performance]
        L50[p50 latency]
        L99[p99 latency]
        T2[Target: under 1500 ms RTT]
        L50 --> T2
        L99 --> T2
    end
```

Control comparison: each metric is measured on **raw audio** versus **anonymized/surrogated audio** so privacy gains can be plotted against transcription and summarization loss.

```mermaid
flowchart LR
    RAW[Raw audio control] --> M[Same clinical clips]
    ANON[Anonymized audio] --> M
    M --> W[WER / CER]
    M --> S[LLM insight quality]
    M --> P[Speaker EER]
    M --> L[End-to-end latency]
```

---

## 5. Expected Contributions & Future Scope

1. **System design pattern for speech AI.** Provides a reusable, open-source architectural reference for privacy-first, low-latency streaming audio processing applicable to healthcare, legal, and financial domains.
2. **Empirical trade-off dataset.** Establishes benchmark data evaluating how acoustic voice anonymization affects downstream Whisper transcription precision and LLM summarization quality.
3. **Foundation for advanced real-time systems.** Lays the groundwork for future research into on-device edge AI hardware acceleration and zero-knowledge streaming speech analytics.

```mermaid
timeline
    title Research trajectory
    section Near term
        Hybrid pipeline : Edge anonymization : FastAPI WebSocket orchestrator : Local PHI restoration
    section Evaluation
        Privacy vs accuracy : Speaker EER : WER and CER : Sub-1.5s latency
    section Future
        Next research : On-device edge AI : Zero-knowledge streaming speech
```
