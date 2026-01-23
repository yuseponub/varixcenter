# Feature Landscape

**Domain:** Clinic Management System for Phlebology Practice
**Researched:** 2026-01-23
**Confidence:** MEDIUM (based on WebSearch verified against multiple sources)

---

## Context: VarixCenter Specific Requirements

- **Practice:** Phlebology clinic treating varicose veins
- **Services:** Consultations, ultrasound diagnostics, sclerotherapy, ECOR procedures
- **Team:** 2 doctors, 3 nurses/secretaries
- **Core Problem:** Internal payment fraud (staff deleting/modifying payment records)
- **Key Need:** Immutable audit trails for payments and cash reconciliation
- **Doctor Preference:** Voice dictation over typing

---

## Table Stakes

Features users expect. Missing = product feels incomplete or unusable.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Patient Registry** | Foundation for all clinical operations | Low | None | Name, ID, contact, demographics. Must support search/filter. |
| **Appointment Scheduling** | Core daily workflow for front desk | Medium | Patient Registry | Calendar view, drag-and-drop, conflict detection, recurring appointments |
| **Medical Records (Basic)** | Legal requirement, clinical continuity | Medium | Patient Registry | Chief complaint, diagnosis, treatment notes per visit |
| **Payment Recording** | Cash flow tracking is fundamental | Low | Patient Registry | Record payments by method (cash, card, transfer) |
| **User Authentication** | Security baseline | Low | None | Login/logout, password management |
| **Role-Based Access Control** | Regulatory and operational necessity | Medium | Authentication | Doctor vs secretary permissions; who can see/edit what |
| **Basic Reports** | Practice management requires visibility | Medium | All above | Daily collections, appointment lists, patient counts |
| **Patient History View** | Doctors need context before consultations | Low | Medical Records | Timeline of visits, treatments, payments |
| **Backup & Recovery** | Data loss = practice shutdown | Low | Database | Automated backups, tested restore procedures |
| **Data Security** | Regulatory compliance (varies by country) | Medium | All | Encryption at rest and in transit |

### Table Stakes Rationale

These features appear in 90%+ of clinic management software reviewed. Users switching from paper or competing systems will expect these from day one. Absence would be disqualifying.

---

## Differentiators

Features that set VarixCenter apart. Not universally expected, but solve the clinic's specific problems.

### Tier 1: Core Differentiators (Solve the Problem Statement)

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Immutable Payment Audit Trail** | **Directly solves fraud problem.** Every payment action logged with timestamp, user, and full before/after state. Cannot be deleted or modified. | Medium | Payment Recording | This is THE differentiator. Append-only log. Cryptographic integrity checks optional but valuable. |
| **Cash Drawer Reconciliation** | End-of-day reconciliation with expected vs actual cash counts. Discrepancies flagged and logged. | Medium | Payment Recording, Audit Trail | Secretary records drawer counts; system calculates expected totals. Variance reports. |
| **Payment Deletion Prevention** | Payments can only be "voided" (with reason), not deleted. Original record preserved. | Low | Payment Recording | Soft-delete pattern. Void requires supervisor approval or reason code. |
| **Daily Closing Process** | Formal daily close that locks records, generates summary, prevents backdating. | Medium | Cash Reconciliation, Payments | Once closed, day's records are immutable. Management can review closing reports. |

### Tier 2: Productivity Differentiators

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Voice Dictation for Clinical Notes** | Doctors prefer speaking. 3-5x faster than typing. Reduces after-hours documentation burden. | High | Medical Records | Integrate with speech-to-text API (AWS Transcribe Medical, Whisper, or similar). Must handle Spanish medical terminology. |
| **Phlebology-Specific Templates** | Pre-built templates for varicose veins, sclerotherapy, ECOR procedures. Reduces documentation time. | Medium | Medical Records | Dropdown fields for common findings, CEAP classification, vein segments. |
| **Ultrasound Image/Document Attachment** | Clinical photos and ultrasound images attached to patient records. | Medium | Medical Records | File upload, storage, thumbnail preview. Critical for vein mapping documentation. |
| **Treatment Progress Tracking** | Track multi-session treatments (sclerotherapy often requires 3-5 sessions). | Medium | Medical Records, Appointments | Visual timeline, session notes, before/after comparison support. |

### Tier 3: Operational Differentiators (Post-MVP)

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **SMS/WhatsApp Appointment Reminders** | Reduce no-shows (industry sees 20-30% reduction). | Medium | Appointments, External API | Requires SMS gateway integration. WhatsApp Business API has complexity. |
| **Waiting List Management** | Fill cancelled slots automatically. | Low | Appointments | Queue of patients wanting earlier appointments. |
| **Procedure-Based Pricing** | Pre-defined prices per procedure type. | Low | Payments | Reduces errors, speeds billing. |
| **Performance Dashboard** | Real-time metrics: revenue, patient flow, doctor productivity. | Medium | All data sources | KPIs visible at a glance. Management reporting. |

---

## Anti-Features

Features to explicitly NOT build for v1. Common in the domain but risky, premature, or irrelevant.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Insurance/Claims Processing** | Massive complexity (claim submission, denial management, ERA/EOB processing). This clinic appears to be mostly private-pay or simple insurance. | Record insurance company name for reference. Manual claims outside system. |
| **Full EHR/EMR Integration** | HL7/FHIR integration is complex, expensive, and unnecessary for standalone clinic. | Build self-contained system. Export capabilities if needed later. |
| **E-Prescribing** | Requires regulatory compliance, pharmacy network integration, and controlled substance handling. | Record prescriptions as notes. Doctors write paper/standard e-prescription. |
| **Patient Self-Service Portal** | Significant added complexity (auth, security, notifications). Small clinic can manage with phone. | Direct scheduling via phone/WhatsApp. No patient-facing app for v1. |
| **Telehealth/Video Consultations** | Not core to phlebology (physical examination required). Complexity of HIPAA-compliant video. | Out of scope entirely. |
| **AI Diagnosis Assistance** | Regulatory risk, liability concerns, premature for v1. | Templates and checklists instead. |
| **Multi-Location Support** | Premature optimization. Single clinic first. | Simple architecture that could expand later but not designed for it now. |
| **Inventory/Supply Management** | Different problem domain. Adds complexity. | Use separate system or spreadsheet for now. |
| **Marketing/CRM Campaigns** | Feature creep. Not solving the core problem. | Out of scope. |
| **Complex Reporting/BI** | Start with essential reports. Fancy dashboards can wait. | Basic reports in v1. Export to Excel for advanced analysis. |
| **Chatbot/AI Scheduling** | Trend-chasing. Small clinic doesn't need it. | Human-mediated scheduling. |

### Anti-Feature Rationale

The research revealed that 80%+ of software features go unused. For a 5-person clinic solving a specific fraud problem, the MVP must be ruthlessly focused. Every feature above adds development time, testing burden, and training complexity. They can all be added later if genuinely needed.

---

## Feature Dependencies

```
Authentication
    |
    v
Role-Based Access Control
    |
    +---> Patient Registry
    |         |
    |         +---> Appointments
    |         |         |
    |         |         +---> SMS Reminders (post-MVP)
    |         |
    |         +---> Medical Records
    |         |         |
    |         |         +---> Templates
    |         |         +---> Image Attachments
    |         |         +---> Voice Dictation
    |         |
    |         +---> Payments
    |                   |
    |                   +---> Audit Trail (CRITICAL)
    |                   +---> Cash Reconciliation
    |                   +---> Daily Closing
    |
    +---> Reports (depends on all data)
```

### Dependency Notes

1. **Audit Trail must be built from the start** - Retrofitting is painful and error-prone
2. **Patient Registry is foundational** - Everything links to patients
3. **Authentication/RBAC gates everything** - Must be correct early
4. **Voice dictation is independent** - Can be added to existing Medical Records

---

## MVP Recommendation

### Phase 1: Foundation + Fraud Prevention (Must Have)

1. **User Authentication & RBAC** - Gate everything else
2. **Patient Registry** - Foundation
3. **Appointments (Basic)** - Core workflow
4. **Payments with Immutable Audit Trail** - Solves the core problem
5. **Cash Reconciliation + Daily Closing** - Completes fraud prevention
6. **Basic Reports** - Collection summaries, daily closing reports

### Phase 2: Clinical Excellence

1. **Medical Records** - Full visit documentation
2. **Phlebology Templates** - Speed up documentation
3. **Image/Document Attachments** - Ultrasound, clinical photos
4. **Patient History View** - Context for consultations

### Phase 3: Productivity Boost

1. **Voice Dictation** - Doctor productivity
2. **SMS Appointment Reminders** - Reduce no-shows
3. **Procedure-Based Pricing** - Billing efficiency

### Defer to Post-v1

- Patient portal
- Insurance claims
- Inventory management
- Multi-location
- Advanced analytics

---

## Complexity Assessment Summary

| Complexity | Features |
|------------|----------|
| **Low** | Patient Registry, Payment Recording, Basic Auth, Deletion Prevention, Procedure Pricing, Patient History View |
| **Medium** | Appointments, RBAC, Medical Records, Audit Trail, Cash Reconciliation, Daily Closing, Templates, Image Attachments, Reports, SMS Reminders |
| **High** | Voice Dictation (API integration, medical terminology, Spanish language support) |

---

## Sources

### General Clinic Management Features
- [Capterra Medical Practice Management Software](https://www.capterra.com/medical-practice-management-software/)
- [Pabau Practice Management Features](https://pabau.com/blog/practice-management-software-features/)
- [Fullscript Clinic Management Features](https://fullscript.com/blog/essential-clinic-management-software-features-for-modern-healthcare)
- [Rupa Health Essential Features](https://www.rupahealth.com/post/top-10-essential-clinic-management-software-features)

### Phlebology/Vein Clinic Specific
- [FindEMR Vascular Phlebology Software](https://www.findemr.com/vascular-phlebology-emr-software)
- [Clinicea Phlebology Clinic Software](https://clinicea.com/phlebology)
- [Praxis EMR for Phlebology](https://www.praxisemr.com/best-ehr-for-phlebology.html)

### Audit Trail & Fraud Prevention
- [BillRMD Audit Trail Software](https://www.billrmd.com/audit-trails-ensuring-accountability-in-healthcare-with-practice-management-software)
- [SolveXia Medical Billing Reconciliation](https://www.solvexia.com/blog/medical-billing-reconciliation-process)
- [HelloNote Payment Tracking](https://hellonote.com/payment-tracking-billing-reconciliation-healthcare/)

### Voice Dictation
- [Lindy Medical Dictation](https://www.lindy.ai/blog/best-medical-speech-to-text)
- [Freed AI Medical Scribe](https://www.getfreed.ai/resources/medical-dictation-software)
- [Amazon Transcribe Medical](https://aws.amazon.com/transcribe/medical/)

### Scheduling & Patient Management
- [SelectHub Patient Scheduling Features](https://www.selecthub.com/patient-scheduling/patient-scheduling-software-requirements/)
- [Healthray Healthcare Appointment Software 2026](https://healthray.com/blog/doctor-appointment-system/healthcare-appointment-software/)

### Anti-Pattern Sources
- [Designli Feature Creep](https://designli.co/blog/what-is-feature-creep-and-how-to-avoid-it)
- [Topflight MVP Scope Creep](https://topflightapps.com/ideas/avoid-scope-creep/)
- [Meddbase Implementation Mistakes](https://www.meddbase.com/practice-management-software/implementation-mistakes/)
