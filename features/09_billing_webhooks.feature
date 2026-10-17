Feature: Billing webhooks
  As the operator of a paid service
  I want only genuine, signature-verified provider events to change anything
  And I never want a retried event applied twice

  # A browser saying "payment succeeded" is a claim. The webhook is the fact.
  # These scenarios pin the signature check against a precomputed vector, so
  # they fail if the algorithm changes rather than silently agreeing with
  # whatever the code now does.
  Scenario: A genuine Razorpay signature verifies
    Given the known-good Razorpay webhook body and signature
    Then the signature should verify

  Scenario Outline: Anything tampered with is refused
    Given the known-good Razorpay webhook body and signature
    When the <part> is altered
    Then the signature should not verify

    Examples:
      | part      |
      | body      |
      | signature |
      | secret    |

  Scenario: A missing signature header is refused
    Given the known-good Razorpay webhook body and signature
    When the signature header is absent
    Then the signature should not verify

  Scenario: A signature of the wrong length is refused rather than throwing
    Given the known-good Razorpay webhook body and signature
    When the signature is truncated
    Then the signature should not verify

  # Providers retry. The same subscription.charged arriving twice must not
  # extend a subscription twice.
  Scenario: The same event is applied once, however many times it arrives
    Given an empty billing ledger
    When the same signed event is delivered three times
    Then it should be applied once and replayed twice
    And the ledger should hold 3 entries

  Scenario: An event that failed to verify stays retryable
    Given an empty billing ledger
    When an event with a bad signature is delivered twice
    Then both deliveries should be refused with status 401
    And nothing should be recorded as applied

  Scenario: Our own reference survives the round trip
    Given the known-good Razorpay webhook body and signature
    When the webhook is verified
    Then the event reference should be "acct-42"
    And the event type should be "subscription.charged"

  Scenario: An unrecognised driver reports itself unready rather than falling back
    Given the billing driver is set to "moneybags"
    Then billing should report that it is not ready
    And the billing reason should name the valid drivers

  Scenario: Status never exposes a credential
    Given the billing driver is set to "razorpay" with test credentials
    Then the reported status should not contain the key secret
    And the reported status should not contain the webhook secret
