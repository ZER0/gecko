/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {utils: Cu} = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const {actionCreators: ac, actionTypes: at} = Cu.import("resource://activity-stream/common/Actions.jsm", {});
const {TippyTopProvider} = Cu.import("resource://activity-stream/lib/TippyTopProvider.jsm", {});
const {insertPinned, TOP_SITES_SHOWMORE_LENGTH} = Cu.import("resource://activity-stream/common/Reducers.jsm", {});
const {Dedupe} = Cu.import("resource://activity-stream/common/Dedupe.jsm", {});
const {shortURL} = Cu.import("resource://activity-stream/lib/ShortURL.jsm", {});

XPCOMUtils.defineLazyModuleGetter(this, "NewTabUtils",
  "resource://gre/modules/NewTabUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Screenshots",
  "resource://activity-stream/lib/Screenshots.jsm");

const UPDATE_TIME = 15 * 60 * 1000; // 15 minutes
const DEFAULT_SITES_PREF = "default.sites";
const DEFAULT_TOP_SITES = [];
const FRECENCY_THRESHOLD = 100; // 1 visit (skip first-run/one-time pages)

this.TopSitesFeed = class TopSitesFeed {
  constructor() {
    this.lastUpdated = 0;
    this._tippyTopProvider = new TippyTopProvider();
    this.dedupe = new Dedupe(this._dedupeKey);
  }
  _dedupeKey(site) {
    return site && site.hostname;
  }
  refreshDefaults(sites) {
    // Clear out the array of any previous defaults
    DEFAULT_TOP_SITES.length = 0;

    // Add default sites if any based on the pref
    if (sites) {
      for (const url of sites.split(",")) {
        const site = {
          isDefault: true,
          url
        };
        site.hostname = shortURL(site);
        DEFAULT_TOP_SITES.push(site);
      }
    }
  }
  async getScreenshot(url) {
    let screenshot = await Screenshots.getScreenshotForURL(url);
    const action = {type: at.SCREENSHOT_UPDATED, data: {url, screenshot}};
    this.store.dispatch(ac.BroadcastToContent(action));
  }
  async getLinksWithDefaults(action) {
    let frecent = await NewTabUtils.activityStreamLinks.getTopSites();
    const notBlockedDefaultSites = DEFAULT_TOP_SITES.filter(site => !NewTabUtils.blockedLinks.isBlocked({url: site.url}));
    const defaultUrls = notBlockedDefaultSites.map(site => site.url);
    let pinned = NewTabUtils.pinnedLinks.links;
    pinned = pinned.map(site => site && Object.assign({}, site, {
      isDefault: defaultUrls.indexOf(site.url) !== -1,
      hostname: shortURL(site)
    }));

    if (!frecent) {
      frecent = [];
    } else {
      // Get the best history links that pass the frecency threshold
      frecent = frecent.filter(link => link && link.type !== "affiliate" &&
        link.frecency > FRECENCY_THRESHOLD).map(site => {
          site.hostname = shortURL(site);
          return site;
        });
    }

    // Remove any duplicates from frecent and default sites then insert the
    // original pinned sites into the deduped frecent ([1]) and defaults ([2])
    const deduped = this.dedupe.group(pinned, frecent, notBlockedDefaultSites);
    pinned = insertPinned([...deduped[1], ...deduped[2]], pinned);

    return pinned.slice(0, TOP_SITES_SHOWMORE_LENGTH);
  }
  async refresh(target = null) {
    const links = await this.getLinksWithDefaults();

    // First, cache existing screenshots in case we need to reuse them
    const currentScreenshots = {};
    for (const link of this.store.getState().TopSites.rows) {
      if (link && link.screenshot) {
        currentScreenshots[link.url] = link.screenshot;
      }
    }

    // Now, get a tippy top icon or screenshot for every item
    for (let link of links) {
      if (!link) { continue; }

      // Check for tippy top icon.
      link = this._tippyTopProvider.processSite(link);
      if (link.tippyTopIcon) { continue; }

      // If no tippy top, then we get a screenshot.
      if (currentScreenshots[link.url]) {
        link.screenshot = currentScreenshots[link.url];
      } else {
        this.getScreenshot(link.url);
      }
    }
    const newAction = {type: at.TOP_SITES_UPDATED, data: links};

    if (target) {
      // Send an update to content so the preloaded tab can get the updated content
      this.store.dispatch(ac.SendToContent(newAction, target));
    } else {
      // Broadcast an update to all open content pages
      this.store.dispatch(ac.BroadcastToContent(newAction));
    }
    this.lastUpdated = Date.now();
  }
  _getPinnedWithData() {
    // Augment the pinned links with any other extra data we have for them already in the store
    const links = this.store.getState().TopSites.rows;
    const pinned = NewTabUtils.pinnedLinks.links;
    return pinned.map(pinnedLink => {
      if (pinnedLink) {
        const hostname = shortURL(pinnedLink);
        return Object.assign(links.find(link => link && link.url === pinnedLink.url) || {hostname}, pinnedLink);
      }
      return pinnedLink;
    });
  }
  _broadcastPinnedSitesUpdated() {
    this.store.dispatch(ac.BroadcastToContent({
      type: at.PINNED_SITES_UPDATED,
      data: this._getPinnedWithData()
    }));
  }
  pin(action) {
    const {site, index} = action.data;
    NewTabUtils.pinnedLinks.pin(site, index);
    this._broadcastPinnedSitesUpdated();
  }
  unpin(action) {
    const {site} = action.data;
    NewTabUtils.pinnedLinks.unpin(site);
    this._broadcastPinnedSitesUpdated();
  }
  _insertPin(site, index) {
    // Insert a pin at the given index. If that slot is already taken, we need
    // to insert it in the next slot. Rinse and repeat if that next slot is also
    // taken.
    let pinned = NewTabUtils.pinnedLinks.links;
    if (pinned.length > index && pinned[index]) {
      this._insertPin(pinned[index], index + 1);
    }
    NewTabUtils.pinnedLinks.pin(site, index);
  }
  add(action) {
    // Adding a top site pins it in the first slot, pushing over any link already
    // pinned in the slot.
    this._insertPin(action.data.site, 0);

    this._broadcastPinnedSitesUpdated();
  }
  async onAction(action) {
    switch (action.type) {
      case at.INIT:
        await this._tippyTopProvider.init();
        this.refresh();
        break;
      case at.NEW_TAB_LOAD:
        if (
          // When a new tab is opened, if the last time we refreshed the data
          // is greater than 15 minutes, refresh the data.
          (Date.now() - this.lastUpdated >= UPDATE_TIME)
        ) {
          this.refresh(action.meta.fromTarget);
        }
        break;
      // All these actions mean we need new top sites
      case at.MIGRATION_COMPLETED:
      case at.PLACES_HISTORY_CLEARED:
      case at.PLACES_LINK_DELETED:
      case at.PLACES_LINK_BLOCKED:
        this.refresh();
        break;
      case at.PREF_CHANGED:
        if (action.data.name === DEFAULT_SITES_PREF) {
          this.refreshDefaults(action.data.value);
        }
        break;
      case at.PREFS_INITIAL_VALUES:
        this.refreshDefaults(action.data[DEFAULT_SITES_PREF]);
        break;
      case at.TOP_SITES_PIN:
        this.pin(action);
        break;
      case at.TOP_SITES_UNPIN:
        this.unpin(action);
        break;
      case at.TOP_SITES_ADD:
        this.add(action);
        break;
    }
  }
};

this.UPDATE_TIME = UPDATE_TIME;
this.DEFAULT_TOP_SITES = DEFAULT_TOP_SITES;
this.EXPORTED_SYMBOLS = ["TopSitesFeed", "UPDATE_TIME", "DEFAULT_TOP_SITES"];
