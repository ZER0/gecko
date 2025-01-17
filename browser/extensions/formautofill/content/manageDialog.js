/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported ManageAddresses, ManageCreditCards */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;
const EDIT_ADDRESS_URL = "chrome://formautofill/content/editAddress.xhtml";
const EDIT_CREDIT_CARD_URL = "chrome://formautofill/content/editCreditCard.xhtml";
const AUTOFILL_BUNDLE_URI = "chrome://formautofill/locale/formautofill.properties";

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://formautofill/FormAutofillUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "profileStorage",
                                  "resource://formautofill/ProfileStorage.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "MasterPassword",
                                  "resource://formautofill/MasterPassword.jsm");

this.log = null;
FormAutofillUtils.defineLazyLogGetter(this, "manageAddresses");

class ManageRecords {
  constructor(subStorageName, elements) {
    this._storageInitPromise = profileStorage.initialize();
    this._subStorageName = subStorageName;
    this._elements = elements;
    this._records = [];
    this._newRequest = false;
    this._isLoadingRecords = false;
    this.prefWin = window.opener;
    this.localizeDocument();
    window.addEventListener("DOMContentLoaded", this, {once: true});
  }

  async init() {
    await this.loadRecords();
    this.attachEventListeners();
    // For testing only: Notify when the dialog is ready for interaction
    window.dispatchEvent(new CustomEvent("FormReady"));
  }

  uninit() {
    log.debug("uninit");
    this.detachEventListeners();
    this._elements = null;
  }

  localizeDocument() {
    FormAutofillUtils.localizeMarkup(AUTOFILL_BUNDLE_URI, document);
  }

  /**
   * Get the selected options on the addresses element.
   *
   * @returns {array<DOMElement>}
   */
  get _selectedOptions() {
    return Array.from(this._elements.records.selectedOptions);
  }

  /**
   * Get storage and ensure it has been initialized.
   * @returns {object}
   */
  async getStorage() {
    await this._storageInitPromise;
    return profileStorage[this._subStorageName];
  }

  /**
   * Load records and render them. This function is a wrapper for _loadRecords
   * to ensure any reentrant will be handled well.
   */
  async loadRecords() {
    // This function can be early returned when there is any reentrant happends.
    // "_newRequest" needs to be set to ensure all changes will be applied.
    if (this._isLoadingRecords) {
      this._newRequest = true;
      return;
    }
    this._isLoadingRecords = true;

    await this._loadRecords();

    // _loadRecords should be invoked again if there is any multiple entrant
    // during running _loadRecords(). This step ensures that the latest request
    // still is applied.
    while (this._newRequest) {
      this._newRequest = false;
      await this._loadRecords();
    }
    this._isLoadingRecords = false;

    // For testing only: Notify when records are loaded
    this._elements.records.dispatchEvent(new CustomEvent("RecordsLoaded"));
  }

  async _loadRecords() {
    let storage = await this.getStorage();
    let records = storage.getAll();
    // Sort by last modified time starting with most recent
    records.sort((a, b) => b.timeLastModified - a.timeLastModified);
    await this.renderRecordElements(records);
    this.updateButtonsStates(this._selectedOptions.length);
  }

  /**
   * Render the records onto the page while maintaining selected options if
   * they still exist.
   *
   * @param  {array<object>} records
   */
  async renderRecordElements(records) {
    let selectedGuids = this._selectedOptions.map(option => option.value);
    this.clearRecordElements();
    for (let record of records) {
      let option = new Option(await this.getLabel(record),
                              record.guid,
                              false,
                              selectedGuids.includes(record.guid));
      option.record = record;
      this._elements.records.appendChild(option);
    }
  }

  /**
   * Remove all existing record elements.
   */
  clearRecordElements() {
    let parent = this._elements.records;
    while (parent.lastChild) {
      parent.removeChild(parent.lastChild);
    }
  }

  /**
   * Remove records by selected options.
   *
   * @param  {array<DOMElement>} options
   */
  async removeRecords(options) {
    let storage = await this.getStorage();
    // Pause listening to storage change event to avoid triggering `loadRecords`
    // when removing records
    Services.obs.removeObserver(this, "formautofill-storage-changed");

    for (let option of options) {
      storage.remove(option.value);
      option.remove();
    }

    // Resume listening to storage change event
    Services.obs.addObserver(this, "formautofill-storage-changed");
    // For testing only: notify record(s) has been removed
    this._elements.records.dispatchEvent(new CustomEvent("RecordsRemoved"));
  }

  /**
   * Enable/disable the Edit and Remove buttons based on number of selected
   * options.
   *
   * @param  {number} selectedCount
   */
  updateButtonsStates(selectedCount) {
    log.debug("updateButtonsStates:", selectedCount);
    if (selectedCount == 0) {
      this._elements.edit.setAttribute("disabled", "disabled");
      this._elements.remove.setAttribute("disabled", "disabled");
    } else if (selectedCount == 1) {
      this._elements.edit.removeAttribute("disabled");
      this._elements.remove.removeAttribute("disabled");
    } else if (selectedCount > 1) {
      this._elements.edit.setAttribute("disabled", "disabled");
      this._elements.remove.removeAttribute("disabled");
    }
  }

  /**
   * Handle events
   *
   * @param  {DOMEvent} event
   */
  handleEvent(event) {
    switch (event.type) {
      case "DOMContentLoaded": {
        this.init();
        break;
      }
      case "click": {
        this.handleClick(event);
        break;
      }
      case "change": {
        this.updateButtonsStates(this._selectedOptions.length);
        break;
      }
      case "unload": {
        this.uninit();
        break;
      }
      case "keypress": {
        this.handleKeyPress(event);
        break;
      }
    }
  }

  /**
   * Handle click events
   *
   * @param  {DOMEvent} event
   */
  handleClick(event) {
    if (event.target == this._elements.remove) {
      this.removeRecords(this._selectedOptions);
    } else if (event.target == this._elements.add) {
      this.openEditDialog();
    } else if (event.target == this._elements.edit ||
               event.target.parentNode == this._elements.records && event.detail > 1) {
      this.openEditDialog(this._selectedOptions[0].record);
    }
  }

  /**
   * Handle key press events
   *
   * @param  {DOMEvent} event
   */
  handleKeyPress(event) {
    if (event.keyCode == KeyEvent.DOM_VK_ESCAPE) {
      window.close();
    }
  }

  observe(subject, topic, data) {
    switch (topic) {
      case "formautofill-storage-changed": {
        this.loadRecords();
      }
    }
  }

  /**
   * Attach event listener
   */
  attachEventListeners() {
    window.addEventListener("unload", this, {once: true});
    window.addEventListener("keypress", this);
    this._elements.records.addEventListener("change", this);
    this._elements.records.addEventListener("click", this);
    this._elements.controlsContainer.addEventListener("click", this);
    Services.obs.addObserver(this, "formautofill-storage-changed");
  }

  /**
   * Remove event listener
   */
  detachEventListeners() {
    window.removeEventListener("keypress", this);
    this._elements.records.removeEventListener("change", this);
    this._elements.records.removeEventListener("click", this);
    this._elements.controlsContainer.removeEventListener("click", this);
    Services.obs.removeObserver(this, "formautofill-storage-changed");
  }
}

class ManageAddresses extends ManageRecords {
  constructor(elements) {
    super("addresses", elements);
  }

  /**
   * Open the edit address dialog to create/edit an address.
   *
   * @param  {object} address [optional]
   */
  openEditDialog(address) {
    this.prefWin.gSubDialog.open(EDIT_ADDRESS_URL, null, address);
  }

  /**
   * Get address display label. It should display up to two pieces of
   * information, separated by a comma.
   *
   * @param  {object} address
   * @returns {string}
   */
  getLabel(address) {
    // TODO: Implement a smarter way for deciding what to display
    //       as option text. Possibly improve the algorithm in
    //       ProfileAutoCompleteResult.jsm and reuse it here.
    const fieldOrder = [
      "name",
      "-moz-street-address-one-line",  // Street address
      "address-level2",  // City/Town
      "organization",    // Company or organization name
      "address-level1",  // Province/State (Standardized code if possible)
      "country-name",    // Country name
      "postal-code",     // Postal code
      "tel",             // Phone number
      "email",           // Email address
    ];

    let parts = [];
    if (address["street-address"]) {
      address["-moz-street-address-one-line"] = FormAutofillUtils.toOneLineAddress(
        address["street-address"]
      );
    }
    for (const fieldName of fieldOrder) {
      let string = address[fieldName];
      if (string) {
        parts.push(string);
      }
      if (parts.length == 2) {
        break;
      }
    }
    return parts.join(", ");
  }
}

class ManageCreditCards extends ManageRecords {
  constructor(elements) {
    super("creditCards", elements);
    this.hasMasterPassword = MasterPassword.isEnabled;
    if (this.hasMasterPassword) {
      elements.showCreditCards.setAttribute("hidden", true);
    }
  }

  /**
   * Open the edit address dialog to create/edit a credit card.
   *
   * @param  {object} creditCard [optional]
   */
  async openEditDialog(creditCard) {
    // If master password is set, ask for password if user is trying to edit an
    // existing credit card.
    if (!this.hasMasterPassword || !creditCard || await MasterPassword.prompt()) {
      this.prefWin.gSubDialog.open(EDIT_CREDIT_CARD_URL, null, creditCard);
    }
  }

  /**
   * Get credit card display label. It should display masked numbers and the
   * cardholder's name, separated by a comma. If `showCreditCards` is set to
   * true, decrypted credit card numbers are shown instead.
   *
   * @param  {object} creditCard
   * @param  {boolean} showCreditCards [optional]
   * @returns {string}
   */
  async getLabel(creditCard, showCreditCards = false) {
    let parts = [];
    if (creditCard["cc-number"]) {
      let ccLabel;
      if (showCreditCards) {
        ccLabel = await MasterPassword.decrypt(creditCard["cc-number-encrypted"]);
      } else {
        let {affix, label} = FormAutofillUtils.fmtMaskedCreditCardLabel(creditCard["cc-number"]);
        ccLabel = `${affix} ${label}`;
      }
      parts.push(ccLabel);
    }
    if (creditCard["cc-name"]) {
      parts.push(creditCard["cc-name"]);
    }
    return parts.join(", ");
  }

  async decryptOptions(options) {
    for (let option of options) {
      option.text = await this.getLabel(option.record, true);
    }
    // For testing only: Notify when credit cards have been decrypted
    this._elements.records.dispatchEvent(new CustomEvent("OptionsDecrypted"));
  }

  handleClick(event) {
    if (event.target == this._elements.showCreditCards) {
      this.decryptOptions(this._elements.records.options);
    }
    super.handleClick(event);
  }
}
