Feature: Email delivery
  As a Virasat user
  I want the people I named to actually be told when something happens
  And I never want an email to carry the key to my vault

  # An email that carries the key IS the vault: plaintext between providers,
  # permanent in two inboxes, and the most commonly breached thing a person
  # owns. This is the scenario that must never be weakened.
  Scenario Outline: No template carries key, passphrase or note material
    Given an email built from the "<template>" template
    Then the message should not contain the master key
    And the message should not contain the recovery key
    And the message should not contain the passphrase
    And the message should not contain the note body
    And the message should contain nothing shaped like a secret
    And the message should have a plain text part

    Examples:
      | template          |
      | trusted-friend    |
      | gentle            |
      | urgent            |
      | critical          |
      | release           |

  Scenario: The release notice says plainly that the key is not enclosed
    Given an email built from the "release" template
    Then the message should tell the reader the key is not in the email

  Scenario: The ladder speaks plainly, with no engineering words
    Given an email built from the "critical" template
    Then the message should avoid the words "dead man's switch, escalation, cryptographic, payload, ciphertext"

  Scenario: An invitation carries a link the friend can actually open
    Given an email built from the "trusted-friend" template
    Then the message should contain a link to the invite acceptance page

  # The ladder is recomputed from elapsed days on every read of the heartbeat,
  # so without a ledger a user would receive the whole ladder again on every
  # page load.
  Scenario: The same message is never sent twice
    Given a console mailer with an empty outbox
    When the same message is sent three times
    Then only one email should have left the building
    And the outbox should hold 1 entry

  Scenario: A failed send stays retryable
    Given a mailer whose driver is not configured
    When the same message is sent twice
    Then both attempts should be recorded as failures
    And the message should still be retryable

  Scenario: An unknown driver name is reported rather than silently ignored
    Given the email driver is set to "smoke-signals"
    Then the mailer should report that it is not ready
    And the reason should name the valid drivers
