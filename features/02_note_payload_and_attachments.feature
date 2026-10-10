Feature: Note Payload and Attachments
  As someone keeping both written details and a scanned document in one note
  I want the text and the file to survive every edit
  So that changing one never quietly corrupts or drops the other

  # These exercise packAndEncryptSecretPayload / decryptAndUnpackSecretPayload
  # directly. The editor component they were first written against is gone;
  # the codec they test is used on every note save.

  Scenario: Pack text notes and a PDF file attachment into a unified payload
    Given secret title "Estate Deed & Passwords"
    And plaintext notes "Bank Vault Pin: 4920, Gate Code: 1234"
    And an attached PDF document "estate_deed.pdf" of size 1417845 bytes
    When the secret payload is packed and encrypted using AES-256-GCM
    Then unpacking the decrypted payload should restore both the exact plaintext notes "Bank Vault Pin: 4920, Gate Code: 1234"
    And the PDF document buffer of 1417845 bytes

  Scenario: Update secret title and edit plaintext notes without corrupting attached file
    Given an existing encrypted secret with notes "Old notes" and attached file "deed.pdf"
    When the user edits the notes to "Updated notes for family" and saves changes
    Then re-encrypting the payload should update the text notes
    And retain the attached "deed.pdf" file attachment intact

  Scenario: Delete file attachment while preserving secret text notes
    Given an existing encrypted secret with notes "Important credentials" and attached image "passport.jpg"
    When the user selects delete attachment
    Then saving the secret should remove the image attachment
    And keep the text notes "Important credentials" safely stored
