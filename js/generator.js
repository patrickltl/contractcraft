/* ============================================================
   ContractCraft — document generation engine
   ------------------------------------------------------------
   Produces three documents from form data:
     agreement — Independent Contractor / Freelance Services
                 Agreement (12-15 numbered articles)
     nda       — Mutual Non-Disclosure Agreement
     sow       — Statement of Work template

   Each document is built as a list of typed blocks, then
   rendered to HTML (viewer + standalone file), Markdown, and
   plain text. All user-supplied strings are HTML-escaped.
   ============================================================ */
(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window : globalThis;

  /* ---------------- helpers ---------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function plain(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }
  function fmtMoney(amount, currency) {
    var n = Number(amount);
    if (!isFinite(n) || amount === '' || amount == null) { return ''; }
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n);
    } catch (e) {
      return (currency || 'USD') + ' ' + n.toFixed(2);
    }
  }
  function fmtDate(iso) {
    if (!iso) { return ''; }
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) { return plain(iso); }
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  function todayLong() {
    return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  function numWords(n) {
    var map = { 0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 14: 'fourteen', 30: 'thirty' };
    n = Number(n);
    if (!isFinite(n)) { return ''; }
    return map[n] || String(n);
  }

  var PAY_TERMS = {
    net7:    { label: 'Net 7',  text: 'within seven (7) days of the invoice date' },
    net14:   { label: 'Net 14', text: 'within fourteen (14) days of the invoice date' },
    net30:   { label: 'Net 30', text: 'within thirty (30) days of the invoice date' },
    net50:   { label: '50% upfront / 50% on delivery',
      text: 'fifty percent (50%) of the total fee due upon execution of this Agreement as a non-refundable deposit, and the remaining fifty percent (50%) due upon delivery of the final Deliverables' },
    upfront: { label: '100% upfront',
      text: 'one hundred percent (100%) of the total fee due upon execution of this Agreement, before work begins' }
  };

  var DISPUTE_MODES = {
    med_arb: 'Negotiate, then mediate, then arbitrate',
    arb: 'Negotiate, then arbitrate',
    court: 'Negotiate, then mediation, then courts'
  };

  function governingLawText(d) {
    if (d.law_state === 'other') {
      var o = plain(d.law_other);
      return o ? o : 'the jurisdiction agreed by the Parties in writing';
    }
    return 'the State of ' + d.law_state;
  }

  function disputeText(d) {
    var law = governingLawText(d);
    if (d.dispute === 'arb') {
      return 'If a dispute arises out of or relates to this Agreement, the Parties will first attempt in good faith to resolve it through direct negotiation between designated representatives for a period of at least thirty (30) days. If the dispute is not resolved through negotiation, it will be finally settled by binding arbitration administered in ' + law + ' under the rules of a mutually agreed arbitration provider (or, if none is agreed, the American Arbitration Association). Judgment on the award may be entered in any court of competent jurisdiction. Each Party will bear its own attorneys\u2019 fees and costs unless the arbitrator awards otherwise.';
    }
    if (d.dispute === 'court') {
      return 'If a dispute arises out of or relates to this Agreement, the Parties will first attempt in good faith to resolve it through direct negotiation for at least thirty (30) days, and then through non-binding mediation with a mutually agreed mediator. If the dispute remains unresolved, it will be brought exclusively in the state or federal courts located in ' + law + ', and each Party consents to the personal jurisdiction and venue of those courts. Each Party will bear its own attorneys\u2019 fees unless a court awards otherwise.';
    }
    return 'If a dispute arises out of or relates to this Agreement, the Parties will first attempt in good faith to resolve it through direct negotiation for at least thirty (30) days. If unresolved, the Parties will submit the dispute to non-binding mediation with a mutually agreed mediator before a mutually agreed provider, sharing the mediator\u2019s fees equally. If mediation does not resolve the dispute, it will be finally settled by binding arbitration administered in ' + law + ' under the rules of a mutually agreed arbitration provider (or, if none is agreed, the American Arbitration Association). Judgment on the award may be entered in any court of competent jurisdiction, and each Party will bear its own attorneys\u2019 fees unless the arbitrator awards otherwise.';
  }

  /* ---------------- block model ----------------
     { t:'title', x }  document title
     { t:'meta',  x }  centered line under title
     { t:'h',     x }  numbered article heading (text already numbered)
     { t:'p',     x }  paragraph
     { t:'ol', items:[] }  ordered list
     { t:'kv', rows:[[k,v]] }  key/value table
     { t:'sig', cells:[{role, name}] }  signature columns
  ----------------------------------------------- */

  function partyDesc(role, name, business, address) {
    var bits = [];
    bits.push('\u201c' + role + '\u201d');
    var who = name || '____________________';
    if (business) { who += ', doing business as ' + business; }
    bits.push(who);
    if (address) { bits.push('with a principal place of business at ' + address); }
    return bits.join(', ');
  }

  /* ============ AGREEMENT ============ */

  function buildAgreement(d) {
    var B = [];
    var refs = {}; // section numbers for cross-references

    var effDate = fmtDate(d.start_date) || todayLong();
    var freelancer = partyDesc('Freelancer', d.f_name, d.f_business, d.f_address);
    var client = partyDesc('Client', d.c_name, null, d.c_address);

    B.push({ t: 'title', x: 'INDEPENDENT CONTRACTOR & FREELANCE SERVICES AGREEMENT' });
    B.push({ t: 'meta', x: 'Effective as of ' + effDate });

    B.push({ t: 'p', x: 'This Independent Contractor & Freelance Services Agreement (the \u201cAgreement\u201d) is entered into as of ' + effDate + ' (the \u201cEffective Date\u201d) by and between ' + freelancer + ' (the \u201cFreelancer\u201d), and ' + client + ' (the \u201cClient\u201d). The Freelancer and the Client are each a \u201cParty\u201d and together the \u201cParties.\u201d The Parties agree as follows:' });

    var n = 0;
    function push(title, blocks) {
      n += 1;
      refs[title] = n;
      B.push({ t: 'h', x: n + '. ' + title });
      for (var i = 0; i < blocks.length; i++) { B.push(blocks[i]); }
      return n;
    }
    /* Fixed positions: sections 1-5 are unconditional, so forward
       references can be computed safely. */
    refs.services = 1;
    refs.revisions = 4;
    refs.kill = 5;

    /* 1 — SERVICES */
    push('SERVICES', [
      { t: 'p', x: 'The Client engages the Freelancer, and the Freelancer agrees to perform, the following services (the \u201cServices\u201d): ' + (plain(d.project) ? plain(d.project) : 'the services described in a Statement of Work executed by both Parties (each, an \u201cSOW\u201d), which is incorporated into this Agreement by reference.') }
    ]);

    /* 2 — DELIVERABLES AND TIMELINE */
    var items = (d.deliverables || []).filter(function (x) { return plain(x); }).map(function (x) { return plain(x); });
    var delivBlocks = [];
    if (items.length) {
      delivBlocks.push({ t: 'p', x: 'The Freelancer will deliver the following deliverables (the \u201cDeliverables\u201d):' });
      delivBlocks.push({ t: 'ol', items: items });
    } else {
      delivBlocks.push({ t: 'p', x: 'The Deliverables are the tangible work product described in the Services above or in an SOW, as applicable.' });
    }
    var timeline = 'The Services will commence on ' + (fmtDate(d.start_date) || 'the Effective Date') + '.';
    if (d.end_date) {
      timeline += ' Unless terminated earlier under this Agreement, the Services will continue until completion of the Deliverables, and in any event through ' + fmtDate(d.end_date) + '.';
    } else if (plain(d.duration_text)) {
      timeline += ' The expected duration of the engagement is ' + plain(d.duration_text) + '.';
    } else {
      timeline += ' The Services will continue until the Deliverables are complete or the Agreement is terminated under its terms.';
    }
    timeline += ' The Client will provide timely feedback, decisions, and any Client materials reasonably required for the Freelancer to perform. The Freelancer will notify the Client promptly of any event likely to delay a deadline.';
    delivBlocks.push({ t: 'p', x: timeline });
    push('DELIVERABLES AND TIMELINE', delivBlocks);

    /* 3 — FEES AND PAYMENT */
    var term = PAY_TERMS[d.pay_terms] || PAY_TERMS.net14;
    var feeSentence;
    if (d.rate_type === 'hourly') {
      feeSentence = 'The Client will pay the Freelancer an hourly rate of ' + fmtMoney(d.rate_amount, d.currency) + ' per hour (the \u201cRate\u201d) for time actually and reasonably spent on the Services. The Freelancer will keep reasonable records of time worked and will invoice the Client periodically (no more often than every two (2) weeks), itemizing hours worked during the invoicing period.';
    } else if (d.rate_type === 'fixed') {
      feeSentence = 'The Client will pay the Freelancer a fixed project fee of ' + fmtMoney(d.rate_amount, d.currency) + ' (the \u201cFee\u201d) for the completion of the Services and Deliverables. The Fee covers only the Services and Deliverables described in this Agreement; work outside that scope requires a written change order under Section ' + refs.revisions + ' (Revisions and Scope Changes) below.';
    } else {
      feeSentence = 'The fees for the Services will be as set out in the applicable SOW.';
    }
    var payBlocks = [{ t: 'p', x: feeSentence }];
    payBlocks.push({ t: 'p', x: 'Payment is ' + term.text + ', in ' + (d.currency || 'USD') + ', by a payment method reasonably designated by the Freelancer. Invoices are deemed payable when received. Amounts not disputed in writing within ten (10) days of receipt are deemed accepted. The Client may not withhold or set off amounts except as required by law.' });
    var late = Number(d.late_fee);
    if (isFinite(late) && late > 0) {
      payBlocks.push({ t: 'p', x: 'Late Fees. Any amount not paid when due will bear simple interest at the rate of ' + late + '% per month (or the maximum rate permitted by law, if lower) from the due date until paid. If any invoice remains unpaid more than ten (10) days after written notice, the Freelancer may suspend performance of the Services until the account is current, and any resulting delay will extend the timeline accordingly.' });
    }
    payBlocks.push({ t: 'p', x: 'Each Party is responsible for its own taxes arising from this Agreement. The Client is responsible for any sales, use, or similar taxes on the fees (other than taxes on the Freelancer\u2019s income).' });
    push('FEES AND PAYMENT', payBlocks);
    refs.fees = refs['FEES AND PAYMENT'];

    /* 4 — REVISIONS */
    var rounds = Number(d.revision_rounds);
    if (!isFinite(rounds) || rounds < 0) { rounds = 2; }
    var revText = 'The fees above include ' + numWords(rounds) + ' (' + rounds + ') round' + (rounds === 1 ? '' : 's') + ' of revisions per Deliverable. A \u201crevision round\u201d is one consolidated set of written Client comments delivered on a submitted Deliverable. Requests that materially change the scope, format, or purpose of a Deliverable (rather than correcting it against the original brief) are out of scope and require a written change order stating the additional fees and timeline before the work is performed.';
    if (d.rate_type === 'hourly') {
      revText += ' Out-of-scope work is billed at the Rate above.';
    } else {
      revText += ' Unless a different rate is agreed in the change order, out-of-scope work under a fixed fee is billed at an hourly rate the Parties confirm in writing before that work begins.';
    }
    push('REVISIONS AND SCOPE CHANGES', [{ t: 'p', x: revText }]);

    /* 5 — KILL FEE */
    var kill = Number(d.kill_fee);
    if (!isFinite(kill) || kill < 0) { kill = 25; }
    push('CANCELLATION AND KILL FEE', [
      { t: 'p', x: 'If the Client cancels the engagement for any reason other than the Freelancer\u2019s material breach, the Client will pay (a) all fees for Services performed and approved expenses incurred through the cancellation date, plus (b) a kill fee equal to ' + kill + '% of the unpaid balance of the total fee for the engagement (or, for hourly engagements, ' + kill + '% of the average of the last two (2) invoiced amounts). The kill fee compensates the Freelancer for reserving capacity that is cancelled after scheduling. If the Freelancer cancels without cause, the kill fee is waived and the Client pays only for Services performed through the cancellation date.' }
    ]);

    /* 6 — CONFIDENTIALITY (conditional) */
    if (d.confidentiality !== false) {
      push('CONFIDENTIALITY', [
        { t: 'p', x: '\u201cConfidential Information\u201d means non-public information disclosed by one Party to the other in connection with this Agreement, whether marked confidential or that a reasonable person would understand to be confidential, including business plans, customer data, financials, and unreleased products. Confidential Information does not include information that is or becomes public through no fault of the receiving Party, was lawfully known to the recipient without restriction before disclosure, is independently developed without use of the disclosing Party\u2019s information, or is rightfully received from a third party without duty of confidentiality.' },
        { t: 'p', x: 'The receiving Party will use Confidential Information only to perform this Agreement, protect it with at least the same care it uses for its own similar information (and no less than reasonable care), and limit access to personnel and advisors who need to know it and are bound by comparable obligations. These obligations apply during the term of this Agreement and for three (3) years after (and, for trade secrets, for as long as they remain trade secrets). If disclosure is required by law, the receiving Party will give the disclosing Party prompt notice where lawful so it may seek protective treatment. The Parties may execute a separate non-disclosure agreement; if its terms conflict with this Section, the separate NDA controls for the subject matter it covers.' }
      ]);
      refs.conf = refs['CONFIDENTIALITY'];
    }

    /* 7 — INTELLECTUAL PROPERTY */
    var ipBlocks = [
      { t: 'p', x: 'Work Product. All work product created by the Freelancer under this Agreement (the \u201cWork Product\u201d) is created for the Client\u2019s benefit. However, ownership of the final Deliverables transfers to the Client only upon the Freelancer\u2019s receipt of full, cleared payment of all amounts due under this Agreement.' },
      { t: 'p', x: 'Assignment on Payment. Upon full payment, the Freelancer automatically assigns to the Client all right, title, and interest in and to the final Deliverables, excluding (a) the Freelancer\u2019s pre-existing tools, libraries, methods, and know-how, and (b) the Freelancer\u2019s general skills and experience. To the extent assignment is not effective by law, the Freelancer grants the Client a perpetual, worldwide, irrevocable, royalty-free license to use the final Deliverables for the Client\u2019s business purposes.' },
      { t: 'p', x: 'Until Payment in Full. Until the Freelancer receives full payment, the Freelancer retains all ownership of the Work Product and the Client receives no license or right to use, publish, reproduce, or exploit any of it. If a payment is later rescinded or charged back, the license and assignment for the related Deliverables are void ab initio. The Freelancer retains ownership of preliminary drafts, rejected concepts, and any work not paid for.' },
      { t: 'p', x: 'Client Materials. The Client retains ownership of materials it provides (\u201cClient Materials\u201d) and grants the Freelancer a limited license to use them to perform the Services. The Client represents that it has the rights needed to provide the Client Materials for this purpose.' },
      { t: 'p', x: 'Portfolio. Unless the Client objects in writing, the Freelancer may display the final Deliverables (or non-confidential excerpts) in the Freelancer\u2019s portfolio, website, and social media after the Client\u2019s public release of them.' }
    ];
    push('INTELLECTUAL PROPERTY; ASSIGNMENT ON PAYMENT', ipBlocks);
    refs.ip = refs['INTELLECTUAL PROPERTY; ASSIGNMENT ON PAYMENT'];

    /* 8 — INDEPENDENT CONTRACTOR STATUS */
    push('INDEPENDENT CONTRACTOR STATUS', [
      { t: 'p', x: 'The Freelancer is an independent contractor, not an employee, agent, partner, or joint venturer of the Client. The Freelancer controls the manner and means of performing the Services and is responsible for its own federal, state, and local income and self-employment taxes, insurance, licenses, and business expenses. The Freelancer is not entitled to employee benefits, overtime, or workers\u2019 compensation from the Client. Neither Party may bind the other. The Freelancer may work for other clients, provided the work does not create a direct conflict of interest with the Services. If a government agency recharacterizes the relationship, each Party will bear the amounts legally attributable to it, and the Parties will cooperate in good faith to resolve the assessment.' }
    ]);

    /* 9 — TERMINATION */
    var notice = Number(d.notice_days);
    if (!isFinite(notice) || notice <= 0) { notice = 14; }
    var surv = [refs.ip + ' (Intellectual Property)', 'Limitation of Liability', 'Indemnification'];
    if (refs.conf) { surv.unshift(refs.conf + ' (Confidentiality)'); }
    push('TERMINATION', [
      { t: 'p', x: 'Either Party may terminate this Agreement for convenience on ' + notice + ' days\u2019 prior written notice to the other Party. Either Party may terminate immediately upon written notice if the other Party materially breaches this Agreement and fails to cure the breach within ten (10) days after written notice, or if the other Party becomes insolvent or subject to bankruptcy proceedings.' },
      { t: 'p', x: 'Upon termination, the Client will pay the Freelancer for all Services performed and approved expenses incurred through the effective date of termination (plus any applicable kill fee under Section ' + refs.kill + '). The Freelancer will deliver, and the Client will pay for, any Deliverables completed through that date. Sections ' + surv.join(', ') + ', and Governing Law & Dispute Resolution survive termination, along with any provision that by its nature should survive.' }
    ]);

    /* 10 — LIMITATION OF LIABILITY */
    push('LIMITATION OF LIABILITY', [
      { t: 'p', x: 'EXCEPT FOR FRAUD, WILFUL MISCONDUCT, A PARTY\u2019S INDEMNIFICATION OBLIGATIONS, THE CLIENT\u2019S PAYMENT OBLIGATIONS, OR LIABILITY THAT CANNOT BE LIMITED BY LAW, NEITHER PARTY WILL BE LIABLE TO THE OTHER FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS OR LOST DATA, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. EACH PARTY\u2019S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO THIS AGREEMENT WILL NOT EXCEED THE TOTAL FEES PAID OR PAYABLE BY THE CLIENT UNDER THIS AGREEMENT IN THE THREE (3) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM.' },
      { t: 'p', x: 'The Freelancer warrants that the Services will be performed in a professional and workmanlike manner consistent with generally accepted standards in the Freelancer\u2019s field. The Client\u2019s exclusive remedy for a breach of this warranty is re-performance of the deficient Services or, at the Freelancer\u2019s election, a refund of the fees paid for the deficient Deliverable. EXCEPT AS EXPRESSLY STATED, THE SERVICES AND DELIVERABLES ARE PROVIDED \u201cAS IS.\u201d' }
    ]);

    /* 11 — INDEMNIFICATION */
    push('INDEMNIFICATION', [
      { t: 'p', x: 'The Client will defend, indemnify, and hold harmless the Freelancer from third-party claims, damages, and reasonable attorneys\u2019 fees arising from (a) the Client Materials (including any claim that they infringe or misappropriate rights), (b) the Client\u2019s use of the Deliverables after delivery in a manner not contemplated by this Agreement, or (c) the Client\u2019s breach of this Agreement. The Freelancer will defend, indemnify, and hold harmless the Client from third-party claims, damages, and reasonable attorneys\u2019 fees arising from the Freelancer\u2019s gross negligence, wilful misconduct, or breach of this Agreement. The indemnified Party will give prompt written notice of the claim (provided that delay relieves the indemnitor only to the extent of actual prejudice), allow the indemnitor to control the defense and settlement, and reasonably cooperate. The indemnitor may not settle a claim in a manner that imposes non-monetary obligations on the indemnified Party without its consent.' }
    ]);

    /* 12 — GOVERNING LAW AND DISPUTE RESOLUTION */
    push('GOVERNING LAW AND DISPUTE RESOLUTION', [
      { t: 'p', x: 'This Agreement is governed by the laws of ' + governingLawText(d) + ', without regard to its conflict-of-laws rules. ' + disputeText(d) }
    ]);
    refs.law = refs['GOVERNING LAW AND DISPUTE RESOLUTION'];

    /* 13 — GENERAL PROVISIONS */
    push('GENERAL PROVISIONS', [
      { t: 'p', x: 'Entire Agreement. This Agreement (together with any SOW or NDA referenced in it) is the entire agreement between the Parties regarding its subject matter and supersedes all prior discussions and agreements. It may be amended only in a writing signed by both Parties. If a Statement of Work conflicts with this Agreement, this Agreement controls unless the SOW expressly amends it by section number.' },
      { t: 'p', x: 'Notices. Notices under this Agreement must be in writing and are deemed given when delivered by email to the addresses the Parties designate (with the sender retaining proof of transmission), or one (1) business day after deposit with a nationally recognized courier. Each Party will keep the other informed of current contact information.' },
      { t: 'p', x: 'Assignment. Neither Party may assign this Agreement without the other Party\u2019s prior written consent, except that the Client may assign it to a successor in a merger or sale of substantially all assets, with notice. Any prohibited assignment is void.' },
      { t: 'p', x: 'Severability; Waiver. If any provision is held unenforceable, it will be modified to the minimum extent necessary and the remainder will stay in effect. A Party\u2019s failure to enforce a provision is not a waiver of it. Force Majeure. Neither Party is liable for delays caused by events beyond its reasonable control, provided the affected Party gives notice and resumes performance promptly. Counterparts; Electronic Signatures. This Agreement may be executed in counterparts, including by electronic signature, each of which is an original and all of which together are one instrument. Headings are for convenience only. Relationship of Documents. This Agreement, each SOW, and any NDA are intended to complement one another.' }
    ]);

    /* SIGNATURES */
    B.push({ t: 'h', x: 'SIGNATURES' });
    B.push({ t: 'p', x: 'The Parties confirm they have read this Agreement, agree with it, and are authorized to sign it, and each has executed it as of the Effective Date. This document may be signed electronically; electronic signatures have the same force as originals.' });
    B.push({ t: 'sig', cells: [
      { role: 'FREELANCER', name: (d.f_name || ''), fields: ['Signature: ________________________', 'Name: ' + (d.f_name || '________________________'), 'Title / Business: ' + (d.f_business || '________________________'), 'Date: ____________________________'] },
      { role: 'CLIENT', name: (d.c_name || ''), fields: ['Signature: ________________________', 'Name: ' + (d.c_name || '________________________'), 'Title (if signing for a company): ________________________', 'Date: ____________________________'] }
    ] });

    return { blocks: B, title: 'INDEPENDENT CONTRACTOR & FREELANCE SERVICES AGREEMENT' };
  }

  /* ============ MUTUAL NDA ============ */

  function buildNda(d) {
    var B = [];
    var effDate = todayLong();
    var partyA = (d.f_name || '____________________');
    var partyB = (d.c_name || '____________________');

    B.push({ t: 'title', x: 'MUTUAL NON-DISCLOSURE AGREEMENT' });
    B.push({ t: 'meta', x: 'Effective as of ' + effDate });

    B.push({ t: 'p', x: 'This Mutual Non-Disclosure Agreement (the \u201cAgreement\u201d) is entered into as of ' + effDate + ', between ' + partyA + ' (\u201cParty One\u201d) and ' + partyB + ' (\u201cParty Two\u201d), each a \u201cParty\u201d and together the \u201cParties.\u201d The Parties anticipate discussing a potential or existing engagement (the \u201cPurpose\u201d) and may each disclose confidential information; this Agreement protects both directions of disclosure.' });

    var n = 0;
    function push(title, blocks) {
      n += 1;
      B.push({ t: 'h', x: n + '. ' + title });
      for (var i = 0; i < blocks.length; i++) { B.push(blocks[i]); }
    }

    push('CONFIDENTIAL INFORMATION', [
      { t: 'p', x: '\u201cConfidential Information\u201d means any non-public information a Party (\u201cDiscloser\u201d) discloses to the other (\u201cRecipient\u201d), in any form, that is designated confidential or that a reasonable person would understand to be confidential given its nature and the circumstances of disclosure, including business plans, financial information, customer and supplier lists, product roadmaps, source code, designs, prototypes, pricing, and the terms of this Agreement.' }
    ]);

    push('EXCLUSIONS', [
      { t: 'p', x: 'Confidential Information does not include information that: (a) is or becomes publicly available through no fault of Recipient; (b) Recipient lawfully knew without restriction before disclosure; (c) Recipient independently develops without use of or reference to Discloser\u2019s Confidential Information, as shown by contemporaneous records; (d) Recipient rightfully receives from a third party without duty of confidentiality; or (e) Recipient is required to disclose by law, regulation, or valid court order, provided Recipient gives Discloser prompt written notice where lawful so Discloser may seek a protective order, and discloses only the portion legally required.' }
    ]);

    push('OBLIGATIONS OF THE RECIPIENT', [
      { t: 'p', x: 'Recipient will: (a) use Confidential Information solely for the Purpose and for no other purpose; (b) not disclose it to any third party except to employees, contractors, and professional advisors (\u201cRepresentatives\u201d) who have a need to know for the Purpose and are bound by written confidentiality obligations at least as protective as this Agreement, with Recipient remaining responsible for its Representatives\u2019 compliance; (c) protect it using at least the same degree of care Recipient uses for its own confidential information, and no less than reasonable care; and (d) not reverse engineer, decompile, or disassemble any tangible or software embodiment of it, and not copy except as reasonably required for the Purpose.' }
    ]);

    push('TERM AND SURVIVAL', [
      { t: 'p', x: 'This Agreement begins on the effective date above and continues for two (2) years, during which either Party may disclose Confidential Information. The confidentiality obligations apply to disclosures made during that term and survive for three (3) years after each disclosure (and, for trade secrets under applicable law, for as long as the information remains a trade secret).' }
    ]);

    push('RETURN OR DESTRUCTION', [
      { t: 'p', x: 'Within fifteen (15) days after Discloser\u2019s written request or upon conclusion of the Purpose (whichever is earlier), Recipient will return or securely destroy all Confidential Information and certify destruction in writing, except that Recipient may keep one archival copy and electronic backups subject to continuing confidentiality, and copies required by law or automated backup systems.' }
    ]);

    push('NO LICENSE; NO OBLIGATION', [
      { t: 'p', x: 'All Confidential Information remains the property of Discloser. Nothing grants Recipient any license, assignment, or other rights to Discloser\u2019s intellectual property, whether by implication, estoppel, or otherwise. Nothing obligates either Party to proceed with any transaction or relationship, or restricts either Party from developing products or services independently, provided no Confidential Information of the other is used.' }
    ]);

    push('REMEDIES', [
      { t: 'p', x: 'The Parties agree that unauthorized use or disclosure of Confidential Information may cause irreparable harm for which money damages are inadequate, and that Discloser is entitled to seek injunctive or other equitable relief (in addition to any other remedies) without the necessity of posting a bond, in addition to all other remedies available at law or in equity.' }
    ]);

    push('GENERAL', [
      { t: 'p', x: 'This Agreement is governed by the laws of ' + governingLawText(d) + ', without regard to conflict-of-laws rules. It is the entire agreement between the Parties on its subject matter and may be amended only in writing signed by both Parties. If any provision is unenforceable, the remainder stays in effect. Neither Party may assign this Agreement without the other\u2019s written consent. This Agreement may be executed in counterparts, including by electronic signature.' }
    ]);

    B.push({ t: 'h', x: 'SIGNATURES' });
    B.push({ t: 'p', x: 'Each Party has executed this Agreement as of the effective date above.' });
    B.push({ t: 'sig', cells: [
      { role: 'PARTY ONE', name: partyA, fields: ['Signature: ________________________', 'Name: ' + partyA, 'Title: ___________________________', 'Date: ____________________________'] },
      { role: 'PARTY TWO', name: partyB, fields: ['Signature: ________________________', 'Name: ' + partyB, 'Title: ___________________________', 'Date: ____________________________'] }
    ] });

    return { blocks: B, title: 'MUTUAL NON-DISCLOSURE AGREEMENT' };
  }

  /* ============ STATEMENT OF WORK ============ */

  function buildSow(d) {
    var B = [];
    var effDate = fmtDate(d.start_date) || todayLong();
    var term = PAY_TERMS[d.pay_terms] || PAY_TERMS.net14;

    var feeDesc;
    if (d.rate_type === 'hourly') {
      feeDesc = 'Hourly rate: ' + fmtMoney(d.rate_amount, d.currency) + ' per hour (billed per the Agreement)';
    } else if (d.rate_type === 'fixed') {
      feeDesc = 'Fixed project fee: ' + fmtMoney(d.rate_amount, d.currency);
    } else {
      feeDesc = 'As agreed in writing';
    }

    var endDesc = d.end_date ? fmtDate(d.end_date) : (plain(d.duration_text) ? plain(d.duration_text) + ' from the start date' : 'Until Deliverables accepted');

    B.push({ t: 'title', x: 'STATEMENT OF WORK No. 1' });
    B.push({ t: 'meta', x: 'To the Independent Contractor & Freelance Services Agreement, effective ' + effDate + ', between ' + (d.f_name || 'Freelancer') + ' (\u201cFreelancer\u201d) and ' + (d.c_name || 'Client') + ' (\u201cClient\u201d)' });

    B.push({ t: 'p', x: 'This Statement of Work No. 1 (this \u201cSOW\u201d) is incorporated into and governed by the Agreement identified above. Capitalized terms used but not defined here have the meanings in the Agreement. In case of conflict, the Agreement controls unless this SOW expressly amends a numbered section of the Agreement.' });

    B.push({ t: 'kv', rows: [
      ['Project', plain(d.project).slice(0, 80) || 'Project name as agreed'],
      ['Client', d.c_name || '____________________'],
      ['Client address', d.c_address || '____________________'],
      ['Freelancer', (d.f_name || '____________________') + (d.f_business ? ' (' + d.f_business + ')' : '')],
      ['Freelancer address', d.f_address || '____________________'],
      ['Start date', fmtDate(d.start_date) || '____________________'],
      ['End / duration', endDesc],
      ['Fees', feeDesc],
      ['Payment terms', term.label + ' — ' + term.text],
      ['Currency', d.currency || 'USD'],
      ['Late fee', (isFinite(Number(d.late_fee)) && Number(d.late_fee) > 0 ? Number(d.late_fee) + '% per month on overdue amounts' : 'Per the Agreement')],
      ['Revision rounds included', String(isFinite(Number(d.revision_rounds)) ? d.revision_rounds : 2)],
      ['Termination notice', (isFinite(Number(d.notice_days)) ? d.notice_days : 14) + ' days\u2019 written notice (per the Agreement)'],
      ['Governing law', governingLawText(d)]
    ] });

    var n = 0;
    function push(title, blocks) {
      n += 1;
      B.push({ t: 'h', x: n + '. ' + title });
      for (var i = 0; i < blocks.length; i++) { B.push(blocks[i]); }
    }

    push('SCOPE OF SERVICES', [
      { t: 'p', x: plain(d.project) ? plain(d.project) : 'Describe the services here. This SOW covers only the services described in this section; anything else is a change under Section 4.' }
    ]);

    var items = (d.deliverables || []).filter(function (x) { return plain(x); }).map(function (x) { return plain(x); });
    push('DELIVERABLES AND ACCEPTANCE', items.length
      ? [ { t: 'p', x: 'The Freelancer will deliver:' }, { t: 'ol', items: items },
          { t: 'p', x: 'Deliverables are deemed accepted if the Client does not provide written objections within seven (7) days of delivery. Acceptance is not effective until the corresponding invoice is paid in full, per the Agreement.' } ]
      : [ { t: 'p', x: 'List each deliverable, its format, and its due date. Deliverables are deemed accepted if the Client does not provide written objections within seven (7) days of delivery. Acceptance is not effective until the corresponding invoice is paid in full, per the Agreement.' } ]);

    push('CHANGES', [
      { t: 'p', x: 'Either Party may request changes to this SOW in writing. No change is effective until both Parties sign a written change order describing the change, its effect on fees, and its effect on the timeline. The Freelancer will not perform, and the Client is not obliged to pay for, out-of-scope work performed without an executed change order.' }
    ]);

    push('MILESTONES AND KILL FEE', [
      { t: 'p', x: 'If the Parties agree to milestone payments, each milestone invoice corresponds to the milestones above and is payable on the Agreement\u2019s payment terms. If the Client cancels this SOW, the Agreement\u2019s kill-fee provisions apply.' }
    ]);

    B.push({ t: 'h', x: 'SIGNATURES' });
    B.push({ t: 'p', x: 'By signing, the Parties incorporate this SOW into the Agreement as of the later signature date.' });
    B.push({ t: 'sig', cells: [
      { role: 'FREELANCER', name: (d.f_name || ''), fields: ['Signature: ________________________', 'Name: ' + (d.f_name || '________________________'), 'Date: ____________________________'] },
      { role: 'CLIENT', name: (d.c_name || ''), fields: ['Signature: ________________________', 'Name: ' + (d.c_name || '________________________'), 'Date: ____________________________'] }
    ] });

    return { blocks: B, title: 'STATEMENT OF WORK No. 1' };
  }

  /* ---------------- renderers ---------------- */

  function htmlOf(blocks) {
    var out = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.t === 'title') { out.push('<h1 class="doc-title">' + esc(b.x) + '</h1>'); }
      else if (b.t === 'meta') { out.push('<p class="doc-meta">' + esc(b.x) + '</p>'); }
      else if (b.t === 'h') { out.push('<h2 class="doc-h">' + esc(b.x) + '</h2>'); }
      else if (b.t === 'p') { out.push('<p>' + esc(b.x) + '</p>'); }
      else if (b.t === 'ol') {
        out.push('<ol class="doc-ol">');
        for (var j = 0; j < b.items.length; j++) { out.push('<li>' + esc(b.items[j]) + '</li>'); }
        out.push('</ol>');
      }
      else if (b.t === 'kv') {
        out.push('<table class="doc-kv"><tbody>');
        for (var k = 0; k < b.rows.length; k++) {
          out.push('<tr><th scope="row">' + esc(b.rows[k][0]) + '</th><td>' + esc(b.rows[k][1]) + '</td></tr>');
        }
        out.push('</tbody></table>');
      }
      else if (b.t === 'sig') {
        out.push('<div class="doc-sig">');
        for (var s = 0; s < b.cells.length; s++) {
          var c = b.cells[s];
          out.push('<div class="doc-sig-col"><div class="doc-sig-role">' + esc(c.role) + '</div>');
          for (var f = 0; f < c.fields.length; f++) {
            out.push('<div class="doc-sig-line">' + esc(c.fields[f]) + '</div>');
          }
          out.push('</div>');
        }
        out.push('</div>');
      }
    }
    return out.join('\n');
  }

  function mdOf(blocks) {
    var out = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.t === 'title') { out.push('# ' + b.x, ''); }
      else if (b.t === 'meta') { out.push('*' + b.x + '*', ''); }
      else if (b.t === 'h') { out.push('## ' + b.x, ''); }
      else if (b.t === 'p') { out.push(b.x, ''); }
      else if (b.t === 'ol') {
        for (var j = 0; j < b.items.length; j++) { out.push((j + 1) + '. ' + b.items[j]); }
        out.push('');
      }
      else if (b.t === 'kv') {
        out.push('| Field | Detail |', '| --- | --- |');
        for (var k = 0; k < b.rows.length; k++) { out.push('| ' + b.rows[k][0] + ' | ' + b.rows[k][1] + ' |'); }
        out.push('');
      }
      else if (b.t === 'sig') {
        for (var s = 0; s < b.cells.length; s++) {
          var c = b.cells[s];
          out.push('**' + c.role + '**', '');
          for (var f = 0; f < c.fields.length; f++) { out.push(c.fields[f] + '  '); }
          out.push('');
        }
      }
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function txtOf(blocks) {
    var out = [];
    var width = 78;
    function wrap(text) {
      var words = String(text).split(/\s+/);
      var line = '';
      var res = [];
      for (var i = 0; i < words.length; i++) {
        if ((line + ' ' + words[i]).trim().length > width) { res.push(line.trim()); line = words[i]; }
        else { line += ' ' + words[i]; }
      }
      if (line.trim()) { res.push(line.trim()); }
      return res.join('\n');
    }
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.t === 'title') { out.push(b.x, '='.repeat(Math.min(b.x.length, width)), ''); }
      else if (b.t === 'meta') { out.push(b.x, ''); }
      else if (b.t === 'h') { out.push(b.x, '-'.repeat(Math.min(b.x.length, width)), ''); }
      else if (b.t === 'p') { out.push(wrap(b.x), ''); }
      else if (b.t === 'ol') {
        for (var j = 0; j < b.items.length; j++) { out.push(wrap('  ' + (j + 1) + '. ' + b.items[j])); }
        out.push('');
      }
      else if (b.t === 'kv') {
        for (var k = 0; k < b.rows.length; k++) { out.push(wrap('  ' + b.rows[k][0] + ': ' + b.rows[k][1])); }
        out.push('');
      }
      else if (b.t === 'sig') {
        for (var s = 0; s < b.cells.length; s++) {
          var c = b.cells[s];
          out.push(c.role, '');
          for (var f = 0; f < c.fields.length; f++) { out.push('  ' + c.fields[f]); }
          out.push('');
        }
      }
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function standaloneHtml(docTitle, bodyHtml, opts) {
    opts = opts || {};
    var wm = opts.watermarked
      ? '<div class="cc-standalone-wm" aria-hidden="true">PREVIEW \u2014 UNLOCK TO DOWNLOAD</div>'
      : '';
    var wmCss = opts.watermarked
      ? '.cc-standalone-wm{position:fixed;inset:0;display:flex;flex-wrap:wrap;align-content:space-around;justify-content:space-around;pointer-events:none;z-index:9;transform:rotate(-22deg) scale(1.4);font:700 26px/2 system-ui,sans-serif;color:rgba(37,99,235,.10);letter-spacing:.15em;user-select:none}'
      : '';
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + esc(docTitle) + '</title>\n<style>\n' +
      'body{font-family:Georgia,"Times New Roman",serif;color:#16181d;background:#fff;line-height:1.65;margin:0}\n' +
      '.doc{max-width:8.5in;margin:0 auto;padding:1in .9in 1.2in}\n' +
      'h1{font-size:1.45em;text-align:center;letter-spacing:.04em;margin:0 0 .3em}\n' +
      '.doc-meta{text-align:center;font-style:italic;color:#444;margin:0 0 1.6em}\n' +
      'h2{font-size:1.02em;letter-spacing:.05em;margin:1.5em 0 .5em}\n' +
      'p{margin:0 0 .85em;text-align:justify}\n' +
      '.doc-ol{margin:0 0 1em;padding-left:1.6em}\n' +
      '.doc-ol li{margin-bottom:.45em}\n' +
      '.doc-kv{border-collapse:collapse;width:100%;margin:0 0 1.4em;font-family:system-ui,sans-serif;font-size:.86em}\n' +
      '.doc-kv th,.doc-kv td{border:1px solid #bbb;padding:.42em .6em;text-align:left;vertical-align:top}\n' +
      '.doc-kv th{width:32%;background:#f3f4f6}\n' +
      '.doc-sig{display:flex;gap:2.2em;flex-wrap:wrap;margin-top:1.2em}\n' +
      '.doc-sig-col{flex:1 1 260px}\n' +
      '.doc-sig-role{font-weight:700;letter-spacing:.08em;margin-bottom:.6em;font-family:system-ui,sans-serif;font-size:.9em}\n' +
      '.doc-sig-line{margin-bottom:.55em}\n' +
      '@media print{.doc{padding:0;max-width:none}@page{margin:.9in}}\n' + wmCss +
      '\n</style>\n</head>\n<body>\n<div class="doc">\n' + bodyHtml + '\n</div>\n' + wm + '\n</body>\n</html>\n';
  }

  /* ---------------- public API ---------------- */

  function normalizeData(raw) {
    raw = raw || {};
    return {
      f_name: plain(raw.f_name),
      f_business: plain(raw.f_business),
      f_address: plain(raw.f_address),
      c_name: plain(raw.c_name),
      c_address: plain(raw.c_address),
      project: plain(raw.project),
      deliverables: Array.isArray(raw.deliverables) ? raw.deliverables : [],
      start_date: plain(raw.start_date),
      end_date: plain(raw.end_date),
      duration_text: plain(raw.duration_text),
      rate_type: raw.rate_type === 'hourly' ? 'hourly' : (raw.rate_type === 'fixed' ? 'fixed' : raw.rate_type),
      rate_amount: raw.rate_amount,
      currency: raw.currency || 'USD',
      pay_terms: raw.pay_terms || 'net14',
      late_fee: raw.late_fee,
      revision_rounds: raw.revision_rounds,
      kill_fee: raw.kill_fee,
      confidentiality: raw.confidentiality !== false,
      notice_days: raw.notice_days,
      law_state: raw.law_state || 'California',
      law_other: plain(raw.law_other),
      dispute: raw.dispute || 'med_arb'
    };
  }

  function generateAll(rawData) {
    var d = normalizeData(rawData);
    var ag = buildAgreement(d);
    var nd = buildNda(d);
    var sw = buildSow(d);
    function pack(built, id, fileBase) {
      var html = htmlOf(built.blocks);
      return {
        id: id,
        title: built.title,
        fileBase: fileBase,
        html: html,
        md: mdOf(built.blocks),
        txt: txtOf(built.blocks),
        standaloneHtml: function (watermarked) { return standaloneHtml(built.title, html, { watermarked: !!watermarked }); }
      };
    }
    var suffix = (d.f_name ? '-' + d.f_name.replace(/[^A-Za-z0-9]+/g, '') : '');
    return {
      data: d,
      agreement: pack(ag, 'agreement', 'Freelance-Agreement' + suffix),
      nda: pack(nd, 'nda', 'Mutual-NDA' + suffix),
      sow: pack(sw, 'sow', 'Statement-of-Work' + suffix)
    };
  }

  root.ContractGen = {
    generateAll: generateAll,
    normalizeData: normalizeData,
    standaloneHtml: standaloneHtml,
    fmtMoney: fmtMoney,
    fmtDate: fmtDate,
    PAY_TERMS: PAY_TERMS,
    DISPUTE_MODES: DISPUTE_MODES
  };
})();
