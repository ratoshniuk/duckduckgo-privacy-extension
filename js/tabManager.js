class TabManager {
    constructor() {
        this.tabContainer = {}
    };

    /* This overwrites the current tab data for a given
     * id and is only called in three cases:
     * 1. When we rebuild saved tabs when the browser is restarted
     * 2. When a new tab is opened. See onUpdated listener below
     * 3. When we get a new main_frame request
     */
    create(tabData) {
        let newTab = new Tab(tabData);
        this.tabContainer[newTab.id] = newTab;
        return newTab;
    };

    delete(id) {
        delete this.tabContainer[id];
    };

    /* Called using either a chrome tab object or by id
     * get({tabId: ###});
     */
    get(tabData) {
        return this.tabContainer[tabData.tabId];
    };

    /* This will whitelist any open tabs with the same domain
     * list: name of the whitelist to update
     * domain: domain to whitelist
     * value: whitelist value, true or false
     */
    whitelistDomain(data) {
        this.setGlobalWhitelist(data.list, data.domain, data.value)
        
        for (let tabId in this.tabContainer) {
            let tab = this.tabContainer[tabId];
            if (tab.site && tab.site.domain === data.domain) {
                tab.site.setWhitelisted(data.list, data.value)
            }
        }

    }

    /* Update the whitelists kept in settings
     */
    setGlobalWhitelist(list, domain, value) {
        let globalwhitelist = settings.getSetting(list) || {}

        if (value) {
            globalwhitelist[domain] = true
        }
        else {
            delete globalwhitelist[domain]
        }

        settings.updateSetting(list, globalwhitelist)
    }
}

var tabManager = new TabManager();

chrome.tabs.onRemoved.addListener( (id, info) => {
    // remove the tab object
    tabManager.delete(id);
});

/* This handles the new tab case. You have clicked to 
 * open a new tab and haven't typed in a url yet.
 * This will fire an onUpdated event and we can create
 * an intital tab instance here. We'll update this instance
 * later on when webrequests start coming in.
 */
chrome.tabs.onUpdated.addListener( (id, info) => {
    if (!tabManager.get({'tabId': id})) {
        info.id = id;
        tabManager.create(info);
    }
    else {
        let tab = tabManager.get({tabId: id});
        if (tab && info.status) {
            tab.status = info.status;
        
            // When the tab finishes loading:
            // 1. check main_frame url (via tab.url) for http, update site score
            // 2. check for incomplete upgraded httpse requests and whitelist 
            // the entire site if there are any, notify tabManager, 
            if (tab.status === 'complete') {

                if (tab.url.match(/^https:\/\//)) {
                    tab.site.score.update({hasHTTPS: true})
                }

                if (!tab.site.HTTPSwhitelisted && tab.httpsRequests.length) {
                    // set whitelist for all tabs with this domain
                    tabManager.whitelistDomain({
                        list: 'HTTPSwhitelisted',
                        value: true,
                        domain: tab.site.domain
                    });
                    // then reload this tab
                    chrome.tabs.reload(tab.id);
                }
                
                console.info(tab.site.score);
                tab.updateBadgeIcon();
            }
        }
    }

});

// update tab url after the request is finished. This makes
// sure we have the correct url after any https rewrites
chrome.webRequest.onCompleted.addListener( (request) => {
    let tab = tabManager.get({tabId: request.tabId});
    if (tab) {
        tab.url = request.url;
        tab.updateSite();
    }
}, {urls: ['<all_urls>'], types: ['main_frame']});

