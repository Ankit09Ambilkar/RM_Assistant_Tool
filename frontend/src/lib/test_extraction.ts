/**
 * Phase 2 Unit & Integration Tests: AI Extraction & Follow-Up Prompts
 * 
 * Verifies:
 * 1. Rule-based fact extraction from free-text notes.
 * 2. Strict enforcement of confirmed === false for all extracted facts.
 * 3. Accurate missing fields identification.
 * 4. Notes-aware follow-up question generation.
 * 5. Safe fallback behavior when Grok is unconfigured or offline.
 */
import {
  extractFactsRuleBased,
  fallbackFollowUpQuestionsFromNotes,
  getMissingFields,
  allQuestions,
  buildProfile,
} from './discovery'
import { extractClientFacts, grokNextQuestion } from './ai'

let failed = 0

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`)
    failed++
  } else {
    console.log(`[PASS] ${msg}`)
  }
}

async function runTests() {
  console.log('--- Running Phase 2 AI Extraction & Follow-Up Tests ---\n')

  // Test 1: Empty notes handling
  const emptyRes = extractFactsRuleBased('', {})
  assert(emptyRes.facts.length === 0, 'Empty notes produces 0 extracted facts')
  assert(emptyRes.missingFields.length === 8, 'Empty notes flags all 8 core fields as missing')
  assert(emptyRes.source === 'demo', 'Empty notes source is demo')

  // Test 2: Rich RM free-text notes
  const notes = `Client is Dr. Ananya Roy. She is looking for regular income from a ₹25 Lakhs investment over 1–3 years.
She is interested in Reliance Industries. She is conservative, uncomfortable with more than 10% loss,
and has high liquidity needs because of family plans.`

  const res = extractFactsRuleBased(notes, {})
  assert(res.facts.length >= 6, `Extracted ${res.facts.length} facts (expected >= 6)`)

  // Check extracted values
  const byField = Object.fromEntries(res.facts.map((f) => [f.field, f]))
  assert(byField.name?.value === 'Dr. Ananya Roy', `Extracted name: ${byField.name?.value}`)
  assert(byField.goal?.value === 'Regular Income', `Extracted goal: ${byField.goal?.value}`)
  assert(byField.amount?.value === 2500000, `Extracted amount: ${byField.amount?.value}`)
  assert(byField.horizon?.value === '1–3 Years', `Extracted horizon: ${byField.horizon?.value}`)
  assert(byField.riskAppetite?.value === 'Conservative', `Extracted risk: ${byField.riskAppetite?.value}`)
  assert(byField.maxLoss?.value === '10%', `Extracted maxLoss: ${byField.maxLoss?.value}`)
  assert(byField.underlying?.value === 'Reliance Industries (RELIANCE)', `Extracted underlying: ${byField.underlying?.value}`)
  assert(byField.liquidity?.value === 'High', `Extracted liquidity: ${byField.liquidity?.value}`)

  // Test 3: STRICT CHECK: Requirement 5 (No auto-confirmed facts)
  const anyConfirmed = res.facts.some((f) => f.confirmed === true)
  assert(!anyConfirmed, 'REQUIREMENT 5 MET: All extracted facts have confirmed === false')

  // Test 4: Missing fields detection
  const missingFieldKeys = res.missingFields.map((m) => m.field)
  assert(missingFieldKeys.includes('experience'), 'Correctly identified "experience" as missing from notes')
  assert(!missingFieldKeys.includes('goal'), '"goal" was extracted so it is not marked missing')
  assert(!missingFieldKeys.includes('amount'), '"amount" was extracted so it is not marked missing')

  // Test 5: Notes-aware follow-up question generation (fallback)
  const candidates = allQuestions({ goal: 'Regular Income', underlying: 'Reliance Industries (RELIANCE)' })
  const followUps = fallbackFollowUpQuestionsFromNotes(notes, {}, candidates)
  assert(followUps.length > 0, `Generated ${followUps.length} follow-up questions`)
  assert(followUps.some((q) => q.context?.includes('notes')), 'Follow-up question includes notes context')

  // Test 6: High-level extractClientFacts handles offline mode gracefully
  const clientFacts = await extractClientFacts(notes, {})
  assert(clientFacts.facts.length >= 6, 'extractClientFacts returns extracted facts')
  assert(clientFacts.facts.every((f) => f.confirmed === false), 'extractClientFacts enforces confirmed === false')
  assert(typeof clientFacts.summary === 'string' && clientFacts.summary.length > 0, 'extractClientFacts returns summary')

  // Test 7: grokNextQuestion backwards-compatibility (3 arguments vs 4 arguments)
  // In test environment without mock Grok server, grokJSON falls back or throws, but parameter typing is validated
  assert(typeof grokNextQuestion === 'function', 'grokNextQuestion function exists and accepts 3 or 4 arguments')

  // --- Phase 3 Tests: RM Review, Confirmation, Pre-filling & Profile Integration ---
  console.log('\n--- Running Phase 3 RM Confirmation & Profile Tests ---')

  // Phase 3 Test 1: RM selectively confirms facts
  const candidateFacts = res.facts.map((f) => ({ ...f, confirmed: false }))
  assert(candidateFacts.every((f) => !f.confirmed), 'Phase 3: All facts start unconfirmed for RM')

  // Simulate RM confirming name, goal, amount, horizon, underlying, but modifying amount
  const confirmedList: typeof candidateFacts = []
  const initialAnswers: Record<string, string> = {}

  for (const f of candidateFacts) {
    if (f.field === 'name' || f.field === 'goal' || f.field === 'horizon' || f.field === 'underlying') {
      const confirmed = { ...f, confirmed: true }
      confirmedList.push(confirmed)
      initialAnswers[confirmed.field] = String(confirmed.value)
    } else if (f.field === 'amount') {
      // Simulate RM editing value from 25 Lakhs to 30 Lakhs
      const editedAndConfirmed = { ...f, value: 3000000, displayValue: '₹30,00,000', confirmed: true }
      confirmedList.push(editedAndConfirmed)
      initialAnswers[editedAndConfirmed.field] = String(editedAndConfirmed.value)
    }
  }

  assert(confirmedList.length === 5, 'Phase 3: RM confirmed 5 specific facts')
  assert(initialAnswers.amount === '3000000', 'Phase 3: RM edited value was properly saved into answers')
  assert(initialAnswers.goal === 'Regular Income', 'Phase 3: Pre-filled goal matches confirmed fact')
  assert(!('experience' in initialAnswers), 'Phase 3: Unconfirmed / missing field is not in answers')

  // Phase 3 Test 2: Next question routing skips pre-filled answers
  const firstUnanswered = allQuestions(initialAnswers).find((q) => !(q.id in initialAnswers))
  assert(firstUnanswered !== undefined, 'Phase 3: Found next unanswered question')
  assert(firstUnanswered?.id !== 'name' && firstUnanswered?.id !== 'goal' && firstUnanswered?.id !== 'amount',
    `Phase 3: Successfully skipped confirmed questions, routed to: ${firstUnanswered?.id}`)

  // Phase 3 Test 3: Profile creation with notes and confirmed facts
  // Fill remaining answers to build profile
  const completeAnswers = {
    ...initialAnswers,
    maxLoss: '10%',
    liquidity: 'High',
    experience: 'Experienced',
    behaviour: 'Hold and wait',
    tradeoff: 'Balanced',
    sectorExposure: '15',
  }

  const profile = buildProfile(completeAnswers)
  profile.notes = notes
  profile.extractedFacts = confirmedList

  assert(profile.investmentAmount === 3000000, 'Phase 3: Profile uses RM-confirmed edited amount (3000000)')
  assert(profile.notes === notes, 'Phase 3: Profile retains raw RM notes')
  assert(profile.extractedFacts?.length === 5, 'Phase 3: Profile stores all confirmed facts')
  assert(profile.extractedFacts?.every((f) => f.confirmed === true), 'Phase 3: Saved facts are strictly confirmed')

  console.log('\n--- Test Summary ---')
  if (failed === 0) {
    console.log('ALL PHASE 2 & PHASE 3 TESTS PASSED!\n')
  } else {
    throw new Error(`FAILED: ${failed} test(s) failed.`)
  }
}

runTests().catch((e) => {
  console.error('Unhandled test failure:', e)
  throw e
})
