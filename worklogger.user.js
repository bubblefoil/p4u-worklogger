// ==UserScript==
// @name         p4u-worklogger
// @description  JIRA work log in UU
// @version      2.5.0
// @namespace    https://uuos9.plus4u.net/
// @homepage     https://github.com/bubblefoil/p4u-worklogger
// @author       bubblefoil
// @license      MIT
// @require      https://code.jquery.com/jquery-3.2.1.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @connect      jira.unicorn.eu
// @connect      jira.unicorn.com
// @match        https://uuos9.plus4u.net/uu-specialistwtmg01-main/*
// @run-at       document-idle
// ==/UserScript==

//Test issue - FBLI-7870
const jiraEuUrl = 'https://jira.unicorn.eu';
const jiraComUrl = 'https://jira.unicorn.com';
const jiraRestApiPath = 'rest/api/2';
const jiraIssueKeyPattern = /([A-Z]+-\d+)/;
const jiraIssueProjectPattern = /([A-Z]+)-\d+/;

class PageCheck {

    static isWorkLogFormPage() {
        //Check that the work log page is loaded by querying for some expected elements
        if (document.title !== 'Working Time Management') {
            console.log("Judging by the page title, this does not seem to be the Working Time Management app. Exiting extension script.");
            return false;
        }
        return true;
    }
}

if (!PageCheck.isWorkLogFormPage()) {
    // noinspection JSAnnotator
    return;
} else {
    // language=CSS
    // noinspection JSUnresolvedFunction
    GM_addStyle(`
    /* Widen the month selection button envelope by overriding its fixed width. */
    .uu-specialistwtm-worker-monthly-detail-top-change-month-dropdown {
        min-width: 330px;
    }
    /* Copied from .uu-specialistwtm-worker-monthly-detail-top-back-icon without its padding */
    .wtm-month-switch-button-icon {
        color: #616161;
        font-size: 20px;
        height: fit-content;
    }
    `);

    // Polyfill some syntactic sugar
    Promise.of = Promise.resolve;
}

const jiraIssueLoaderAnimation = `
<style>
    .progress-spinner {
        width: 16px;
        height: 16px;
        -webkit-animation: spin 2s linear infinite; /* Safari */
        animation: spin 1.5s linear infinite;
    }

    /* Safari */
    @-webkit-keyframes spin {
        0% {
            -webkit-transform: rotate(0deg);
        }
        100% {
            -webkit-transform: rotate(360deg);
        }
    }

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }
</style>
<svg class="progress-spinner" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 75.76 75.76">
    <defs>
        <style>.cls-2 { fill: #2684ff; } .cls-3 { fill: url(#linear-gradient); } .cls-4 { fill: url(#linear-gradient-2); }</style>
        <linearGradient id="linear-gradient" x1="34.64" y1="15.35" x2="19" y2="30.99" gradientUnits="userSpaceOnUse"><stop offset="0.18" stop-color="#0052cc"/><stop offset="1" stop-color="#2684ff"/></linearGradient>
        <linearGradient id="linear-gradient-2" x1="38.78" y1="60.28" x2="54.39" y2="44.67" xlink:href="#linear-gradient"/>
    </defs>
    <title>Connecting to Jira...</title>
    <g id="Layer_2">
        <g id="Blue">
            <path class="cls-2" d="M72.4,35.76,39.8,3.16,36.64,0h0L12.1,24.54h0L.88,35.76A3,3,0,0,0,.88,40L23.3,62.42,36.64,75.76,61.18,51.22l.38-.38L72.4,40A3,3,0,0,0,72.4,35.76ZM36.64,49.08l-11.2-11.2,11.2-11.2,11.2,11.2Z"/>
            <path class="cls-3" d="M36.64,26.68A18.86,18.86,0,0,1,36.56.09L12.05,24.59,25.39,37.93,36.64,26.68Z"/>
            <path class="cls-4" d="M47.87,37.85,36.64,49.08a18.86,18.86,0,0,1,0,26.68h0L61.21,51.19Z"/>
        </g>
    </g>
</svg>
`;

/**
 * Branches off the flow into a supplied function, typically to perform side-effects.
 * Returns the input value.
 *
 * @param {function(*): *} f The dead-end functions, may be impure.
 * @return {function(*): (Promise<*> | Promise<void>)} Resolved Promise of the original input
 */
const tee = (f) => (x) => {
    f(x);
    return Promise.of(x);
};

/**
 * Pure form of attribute assignment.
 * Adds an attribute to an object and returns the updated object.
 *
 * @param o Target object
 * @param k Attribute name
 * @param v Attribute value
 * @return {Object} o with o.k = v
 */
const assoc = (o, k, v) => {
    o[k] = v;
    return o;
};

/**
 * Enhances the work log table.
 */
class LogTableDecorator {

    /**
     * Finds the JIRA issue references in the work descriptions in the work log table
     * and replaces them with links.
     */
    static findAndLinkifyJiraIssues() {
        const logTableNodes = document.querySelectorAll('#table-tsitems td.htsItemStyle div.hts_object');
        const hasTextNodes = (p) => Array.from(p.childNodes).find(n => n.nodeType === 3);
        Array.from(logTableNodes)
            .filter(hasTextNodes)
            .forEach(node => this.replaceIssueByLink(node));
    }

    static replaceIssueByLink(element) {
        const issueKeyPatternGlobal = new RegExp(jiraIssueKeyPattern, "g");
        element.innerHTML = element.innerHTML
            .replace(issueKeyPatternGlobal, `<a href="${jiraEuUrl + '/browse'}/$1" target="_blank">$1</a>`);
    }
}

const wtmMessage = {
    cs: {
        'wtm.table.day-range.label': 'ČAS MEZI DNY:',
        'wtm.month.prev.title': 'Předchozí měsíc',
        'wtm.month.next.title': 'Následující měsíc',
    },
    en: {
        'wtm.table.day-range.label': 'TIME BETWEEN DAYS:',
        'wtm.month.prev.title': 'Previous month',
        'wtm.month.next.title': 'Next month',
    }
};

const _t = function (messageCode) {
    if (!messageCode) {
        console.warn('Invalid I18N message code: ', messageCode);
        return '?';
    }
    const getBundle = function () {
        const language = WtmWorktableModel.language();
        if (wtmMessage.hasOwnProperty(language)) {
            return wtmMessage[language];
        }
        return wtmMessage.cs
    };
    const bundle = getBundle();
    if (!bundle.hasOwnProperty(messageCode)) {
        console.warn(`)I18N message "${messageCode}" is not defined for "${WtmWorktableModel.language()}`);
        return messageCode;
    }
    return bundle[messageCode];
};

class WtmDateTime {

    /**
     * Returns parsed date as an array of fields: [day, month, year]. Months are counted from 1.
     * @param {string} selectedDate
     * @return {number[]}
     */
    static parseDate(selectedDate) {
        const dateParts = selectedDate.split(/[.\/]/);
        const dateFields = dateParts.length === 3 && dateParts.map(Number) || [NaN, NaN, NaN];
        if (WtmWorktableModel.language() === 'cs') {
            return dateFields;
        } else {
            const [month, day, year] = dateFields;
            return [day, month, year];
        }
    }

    static parseDateTime(selectedDate, selectedTime) {
        const [day, month, year] = this.parseDate(selectedDate);
        const [hour, minute] = selectedTime.split(':').map(Number);
        return new Date(year, month - 1, day, hour, minute, 0, 0);
    }

    static padToDoubleDigit(num) {
        const norm = Math.floor(Math.abs(num));
        return (norm < 10 ? '0' : '') + norm;
    }

    static addHours(d, h) {
        return this.addMinutes(d, h * 60);
    }

    static addMinutes(d, m) {
        return new Date(d.getTime() + (m * 60 * 1000))
    }
}

/**
 * Access methods to the WTM time table view.
 */
class WtmWorktableModel {

    static language() {
        return document.getElementsByClassName("uu5-bricks-language-selector-code-text")[0].textContent;
    }

    static monthlyDetailTopTimeColumn() {
        return document.querySelector('.uu5-common-div .uu-specialistwtm-worker-monthly-detail-top-time-column');
    }

    static timeTable() {
        return document.querySelector('table.uu5-bricks-table-table');
    }

    /**
     * Reads the day of month from a time table row.
     * @param {HTMLTableRowElement} tableRow
     * @return {number|NaN} Day of month, 0 - 31, or NaN.
     */
    static getDay(tableRow) {
        const dateCellText = tableRow.cells[1].innerText;
        const dateFields = WtmDateTime.parseDate(dateCellText);
        return dateFields[0];
    }

    /**
     * Reads logged working time in minutes from a time table row.
     * @param {HTMLTableRowElement} tableRow
     * @return {number|NaN} Minutes of work, or NaN.
     */
    static getTimeInMinutes(tableRow) {
        const dateCellText = tableRow.cells[2].innerText;
        const match = dateCellText.match(/(\d\d)[:](\d\d)/);
        return match && 60 * Number(match[1]) + Number(match[2]) || NaN;
    }

    /**
     * Filters table rows by given range of days of month.
     * @param {number} dayFrom
     * @param {number} dayTo
     * @return {Promise<HTMLTableRowElement[]>}
     */
    static rowsBetweenDays(dayFrom, dayTo) {
        return new Promise(resolve => {
            const timeTable = WtmWorktableModel.timeTable();
            const firstDay = Math.min(dayFrom, dayTo);
            const lastDay = Math.max(dayFrom, dayTo);
            const rowsInRange = [].filter.call(timeTable.rows, (row, idx) => {
                return idx > 0 && firstDay <= WtmWorktableModel.getDay(row) && WtmWorktableModel.getDay(row) <= lastDay;
            });
            resolve(rowsInRange);
        })
    }

    /**
     *
     * @param dayFrom
     * @param dayTo
     * @return {Promise<number>} Sum of time in selected day range in minutes.
     */
    static minutesBetween(dayFrom, dayTo) {
        return this
            .rowsBetweenDays(dayFrom, dayTo)
            .then((rows) => new Promise(resolve => {
                const minutesTotal = rows
                    .map((row) => WtmWorktableModel.getTimeInMinutes(row))
                    .reduce((acc, minutes) => acc + minutes, 0);
                resolve(minutesTotal);
            }));
    }
}

/**
 * Takes care of Time table extension view.
 */
class WtmWorktableView {

    constructor() {
    }

    static worktableSumViewShow() {
        if (document.getElementById('wtt-time-range-form')) {
            console.log('WTM Extension: Work table already enhanced.');
            WtmWorktableView.updateSum();
            return;
        }
        console.log('WTM Extension: enhancing work table');
        const today = new Date();
        const dayOfWeek = (today.getDay() + 6) % 7;
        const lastMonday = Math.max(today.getDate() - dayOfWeek, 1);
        const nextSunday = Math.min(lastMonday + 6, 31);
        WtmWorktableModel.monthlyDetailTopTimeColumn()
            .insertAdjacentHTML(
                'beforeend',
                `
                <div id="wtt-time-range-form" class="uu-specialistwtm-worker-monthly-detail-top-time-column" style="z-index: 10">
                    <!--Move the span to front, because this div is covered by some uu component's width % and the content is hard to select by mouse-->
                    <span class="uu5-bricks-span uu5-bricks-lsi-item uu5-bricks-lsi uu-specialistwtm-worker-monthly-detail-top-total-time-label" style="width: max-content; min-width: 8em;">${_t('wtm.table.day-range.label')}</span>
                    <input class="uu5-bricks-text uu5-common-text uu-specialistwtm-worker-monthly-detail-table-form-date" type="number" id="wtt-day-from" value="${lastMonday}" min="1" max="31" style="width: 4em; margin: 0.25em">
                    <input class="uu5-bricks-text uu5-common-text uu-specialistwtm-worker-monthly-detail-table-form-date" type="number" id="wtt-day-to" value="${nextSunday}" min="1" max="31" style="width: 4em; margin: 0.25em">
                    <span id="wtt-time-in-range-sum" class="uu5-bricks-span uu-specialistwtm-worker-monthly-detail-top-total-time">${WtmWorktableView.formatToHours(0)}</span>
                </div>`
            );
        WtmWorktableView.getDayFromInput().onchange = () => WtmWorktableView.updateSum();
        WtmWorktableView.getDayFromInput().onclick = () => WtmWorktableView.updateSum();
        WtmWorktableView.getDayToInput().onchange = () => WtmWorktableView.updateSum();
        WtmWorktableView.getDayToInput().onclick = () => WtmWorktableView.updateSum();
        WtmWorktableView.updateSum().catch((e) => console.warn(e));
    }

    static getDayToInput() {
        return document.getElementById('wtt-day-to');
    }

    static getDayFromInput() {
        return document.getElementById('wtt-day-from');
    }

    static async updateSum() {
        const dFrom = Number(WtmWorktableView.getDayFromInput().value);
        const dTo = Number(WtmWorktableView.getDayToInput().value);
        document.getElementById('wtt-time-in-range-sum').innerText = '-h';
        const minutesInRange = await WtmWorktableModel.minutesBetween(dFrom, dTo);
        document.getElementById('wtt-time-in-range-sum').innerText = WtmWorktableView.formatToHours(minutesInRange);
    }

    static formatToHours(minutes) {
        return ` ${Number(Math.round(minutes / 60 * 100) / 100).toLocaleString(WtmWorktableModel.language())}h`;
    }
}

class WtmDialog {

    static descArea() {
        return document.getElementsByTagName("textarea")[0];
    }

    static datePicker() {
        return document.getElementsByName("date")[0]
            .lastChild
            .firstChild
            .firstChild
    }

    static timeFrom() {
        return document.getElementsByName("timeFrom")[0]
            .lastChild
            .firstChild
            .firstChild;
    }

    static timeTo() {
        return document.getElementsByName("timeTo")[0]
            .lastChild
            .firstChild
            .firstChild;
    }

    static artifactField() {
        return document.getElementsByName("subject")[0]
            .lastChild
            .firstChild
            .firstChild;
    }

    static dateFrom() {
        return WtmDateTime.parseDateTime(this.datePicker().value, this.timeFrom().value);
    }

    static dateTo() {
        return WtmDateTime.parseDateTime(this.datePicker().value, this.timeTo().value);
    }

    static getDurationSeconds() {
        const dateFrom = WtmDialog.dateFrom();
        const dateTo = WtmDialog.dateTo();
        if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
            return 0;
        }
        const durationMillis = dateTo - dateFrom;
        return durationMillis > 0 ? durationMillis / 1000 : 0;
    }

    /** Returns the OK button. It is an &lt;a&gt; element containing a structure of spans. */
    static buttonNextItem() {
        return WtmDialog.highRateNode().parentElement
            .lastChild
            .firstChild
            .firstChild
            .firstChild;
    }

    /** Returns the 'Next item' button. It is an &lt;a&gt; element containing a structure of spans, or null in case of work log update. */
    static  buttonOk() {
        return WtmDialog.highRateNode().parentElement
            .lastChild
            .lastChild
            .firstChild
            .firstChild;
    }

    static registerKeyboardShortcuts() {
        WtmDialog.buttonOk().title = "Ctrl + Enter";
        $(document).on("keydown", e => {
            if (e.keyCode === 13 && e.ctrlKey) {
                WtmDialog.buttonOk().click();
            }
        });
        WtmDialog.buttonNextItem().title = "Ctrl + Shift + Enter";
        $(document).on("keydown", e => {
            if (e.keyCode === 13 && e.ctrlKey && e.shiftKey) {
                WtmDialog.buttonNextItem().click();
            }
        });
    }

    /**
     *
     * @param {HTMLElement} element
     * @param {string} key
     */
    static addMnemonic(element, key) {
        if (element && key && key.length === 1 && element.innerText.indexOf(key) > 0) {
            element.innerHTML = element.innerText.replace(key, `<u>${key}</u>`);
            element.accessKey = key;
        }
    }

    static highRateNode() {
        return document.getElementsByName("highRate")[0];
    }
}

/**
 * Wrap log functions to make them more functional.
 * Cannot be wrapped in a class because FF does not support fields and standard function syntax is horribly bloated.
 */
const log = tee(console.log);
const error = tee(console.error);
const warn = tee(console.warn);
const info = tee(console.info);
const debug = tee(console.debug);
const trace = tee(console.trace);

/**
 * Removes leading and trailing slash '/' character.
 * @param s
 * @return {string}
 */
const stripSlashes = (s) => s
    .replace(/^\//, '')
    .replace(/\/?$/, '');

const addRequestParameter = (parameter) => (value) => (url) => {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${parameter}=${value}`;
};

/**
 * @param {...string|string[]} resource path
 * @return {function(*=): Promise<string | Error>}
 */
const getResourceUrl = (...resource) => (domain) => new Promise((resolve, reject) => {
        if (domain && typeof domain === 'string') {
            resolve(`${stripSlashes(domain)}/${resource.flat().map(stripSlashes).join('/')}`);
        } else {
            reject(new TypeError('Invalid url domain :' + domain));
        }
    }
);

/**
 * @param {...string} resourcePath path
 * @return {function(*=): Promise<string | Error>}
 */
const jiraRestApiResource = (...resourcePath) =>
    getResourceUrl([jiraRestApiPath].concat(resourcePath).flat(2));

/**
 * @param {...string} issue JIRA issue key
 * @return {function(string): Promise<string|Error>} Resource url provider which takes domain as the argument.
 */
const jiraRestApiIssueUrl = (issue) => jiraRestApiResource('issue', issue);


/**
 * @param {...string} issue JIRA issue key
 * @return {function(string): Promise<string|Error>} Resource url provider which takes domain as the argument.
 */
const jiraBrowseIssueUrl = (issue) => getResourceUrl('browse', issue);

class InvalidResponse {
    /**
     * @param {HttpResponse} response
     */
    constructor(response) {
        this._url = response.finalUrl;
        this._response = response;
    }

    get response() {
        return this._response;
    }

    get url() {
        return this._url;
    }
}

class InvalidProjectError {

    constructor(projectKey) {
        this._projectKey = projectKey;
    }

    get projectKey() {
        return this._projectKey;
    }
}

class ProjectLoadingError {

    constructor(projectKey) {
        this._projectKey = projectKey;
    }

    get projectKey() {
        return this._projectKey;
    }
}

/**
 * Constructs a base of an HTTP request for json data and GET method.
 *
 * @param {string} url
 * @return {Request} Pre-filled request object for GM_xmlhttpRequest
 */
const getJsonRequest = (url) => ({
    method: 'GET',
    headers: {'Accept': 'application/json'},
    url: url,
    onreadystatechange: function (res) {
        console.debug(`Processing request: [${url}], state: ${res.readyState}`);
    }
});

/**
 * JIRA API connector and utils.
 */
class Jira4U {

    constructor() {
    }

    static tryParseIssue(desc) {
        console.log(`Parsing description: ${desc}`);
        if (typeof desc !== "string") {
            return new WorkDescription();
        }
        return WorkDescription.parse(desc);
    }

    /**
     * @param {string} issueKey
     * @return {Promise<string|TypeError>}
     */
    static getProjectCode(issueKey) {
        if (typeof issueKey !== 'string' || !jiraIssueProjectPattern.test(issueKey)) {
            return Promise.reject(new TypeError(`Invalid argument issueKey: "${issueKey}", expected an issue key`));
        }
        return Promise.of(issueKey.match(jiraIssueProjectPattern)[1]);
    }

    /**
     * @param {Function} onprogress
     * @return {function(Object): Object}
     */
    static setOnProgressCallback(onprogress) {
        return (request) => Object.assign(request, {onreadystatechange: onprogress});
    }
    /**
     * Triggers the actual http request.
     *
     * @typedef HttpResponse
     * @property {number} status
     * @property {string} responseText
     * @property {string} responseHeaders
     * @property {string} finalUrl
     *
     * @param {Request} requestParams
     * @return {Promise<HttpResponse>} A Promise which resolves with the http response.
     */
    static request(requestParams) {
        return new Promise((resolve, reject) => {
            // noinspection JSUnresolvedFunction
            GM_xmlhttpRequest(
                Object.assign(requestParams, {
                    onload: resolve,
                    onerror: reject
                }))
        });
    }

    /**
     * Checks whether http response status is OK (200).
     *
     * @param {HttpResponse} response Http response
     * @return {Promise<HttpResponse|InvalidResponse>}
     */
    static validateStatusOk(response) {
        return (response.status === 200)
            ? Promise.of(response)
            : Promise.reject(new InvalidResponse(response));
    }

    /**
     * @param {HttpResponse} response
     * @return {object}
     */
    static parseResponse(response) {
        return JSON.parse(response.responseText);
    }

    /**
     * Resolve url of the JIRA in which requested project exists.
     *
     * @param {string} projectCode Just the project prefix of a JIRA issue.
     * @return {Promise<string|InvalidProjectError|ProjectLoadingError>} JIRA url
     */
    static getJiraUrlForProject(projectCode) {

        if (!Jira4U.getJiraUrlForProject.cache) {
            //The first time this function is called, init empty cache.
            Jira4U.getJiraUrlForProject.cache = {};
        } else {
            //Try to get the cached value first.
            const cachedValue = Jira4U.getJiraUrlForProject.cache[projectCode];
            if (typeof cachedValue === "string") {
                console.debug(`Resolved code '${projectCode}' as JIRA project '${cachedValue}'`);
                return Promise.of(cachedValue);
            } else if (cachedValue instanceof InvalidProjectError) {
                console.debug(`Resolved code '${projectCode}' as non-existent JIRA project`);
                return Promise.reject(cachedValue);
            }
        }

        //No cached results, define some helper functions, then load projects from jira.

        function cacheAndGet(projectKey, jiraUrl) {
            return Jira4U.getJiraUrlForProject.cache[projectKey] = jiraUrl;
        }

        return Jira4U._validateProjectEverywhere(projectCode, jiraEuUrl, jiraComUrl)
            .then(results => {
                //We do want the errors property, that's the response
                const isOk = r => typeof r.errors !== 'undefined';
                const foundProject = results
                    .filter(isOk)
                    .find(result => /uses this project key/.test(result.errors.projectKey));
                if (foundProject) {
                    return Promise.of(cacheAndGet(projectCode, foundProject.jira));
                } else if (results.every(isOk) && results.every(result => Object.entries(result.errors).length === 0)) {
                        return Promise.reject(cacheAndGet(projectCode, new InvalidProjectError(projectCode)));
                    } else {
                    // In case something failed and we did not find the project code
                    // in another response, there's not much left to do.
                        return Promise.reject(new ProjectLoadingError(projectCode));
                    }
                }
            );
    }

    /**
     * @param {string} project
     * @param {...string} jiraUrls
     * @return {Promise<[]<JiraProjectResult|InvalidResponse>>} Projects per JIRA url or errors.
     * @private
     */
    static _validateProjectEverywhere(project, ...jiraUrls) {
        return Promise.all(jiraUrls.map(url => Jira4U._validateProjectAt(project, url)));
    }

    /**
     * @typedef JiraError What comes from JIRA projectvalidate resource
     * @property {string[]} errorMessages
     * @property {Object} errors
     *
     * @typedef JiraProjectResult
     * @property {string} jira jiraUrl
     * @augments JiraError
     *
     * @param {string} project
     * @param {string} jiraUrl
     * @return {Promise<JiraProjectResult | InvalidResponse>}
     * @private
     */
    static _validateProjectAt(project, jiraUrl) {
        return Promise.of(jiraUrl)
            .then(jiraRestApiResource('projectvalidate', 'key'))
            .then(addRequestParameter('key')(project))
            .then(tee(url => log(`Validating JIRA project: [${url}]`)))
            .then(getJsonRequest)
            .then(Jira4U.request)
            .then(res => Jira4U.validateStatusOk(res))
            .then(Jira4U.parseResponse)
            .then(p => assoc(p, 'jira', jiraUrl))
            .then(tee(res => debug(`Validated project "${project}": ${res}`)))
            .catch(err => Promise.of(err).then(log))
            ;
    }

    /**
     * @param {string} key JIRA issue key string
     * @param {?Function} onprogress Optional loading progress callback
     * @return {Promise<HttpResponse|InvalidResponse>}
     */
    static loadIssue(key, onprogress) {
        return Jira4U.getProjectCode(key)
            .then(Jira4U.getJiraUrlForProject)
            .then(tee(url => debug('project code url: ' + url)))
            .then(jiraRestApiIssueUrl(key))
            .then(tee(url => log(`Resolved JIRA issue url: [${url}]`)))
            .then(getJsonRequest)
            .then(Jira4U.setOnProgressCallback(onprogress))
            .then(Jira4U.request);
    }

    /**
     * @param {string} workInfo.key JIRA issue key string.
     * @param {Date} workInfo.started The date/time the work on the issue started.
     * @param {number} workInfo.duration in seconds.
     * @param {string} workInfo.comment The work log comment.
     * @param {Function} [workInfo.onReadyStateChange] Callback to be invoked when the request state changes.
     * @return {Promise}
     */
    static logWork(workInfo) {
        console.log(`Sending a work log request. Issue=${workInfo.key}, Time spent=${workInfo.duration}minutes, Comment="${workInfo.comment}"`);
        return Jira4U.getProjectCode(workInfo.key)
            .then(Jira4U.getJiraUrlForProject)
            .then(jiraRestApiResource('issue', workInfo.key, 'worklog'))
            .then(url => (
                {
                    method: 'POST',
                    headers: {
                        "Content-Type": "application/json",
                        //Disable the cross-site request check on the JIRA side
                        "X-Atlassian-Token": "nocheck",
                        //Previous header does not work for requests from a web browser
                        "User-Agent": "xx"
                    },
                    data: JSON.stringify({
                        timeSpentSeconds: workInfo.duration,
                        started: Jira4U._toIsoString(workInfo.started),
                        comment: workInfo.comment,
                    }),
                    url: url,
                    onreadystatechange: workInfo.onReadyStateChange
                })
            )
            .then(Jira4U.request);
    }

    /**
     * Converts a date to a proper ISO formatted string, which contains milliseconds and the zone offset suffix.
     * No other date formats are recognized by JIRA.
     * @param {Date} date Valid Date object to be formatted.
     * @returns {string}
     */
    static _toIsoString(date) {
        const offset = -date.getTimezoneOffset();
        const offsetSign = offset >= 0 ? '+' : '-';
        const pad = WtmDateTime.padToDoubleDigit;
        return date.getFullYear()
            + '-' + pad(date.getMonth() + 1)
            + '-' + pad(date.getDate())
            + 'T' + pad(date.getHours())
            + ':' + pad(date.getMinutes())
            + ':' + pad(date.getSeconds())
            + '.' + String(date.getUTCMilliseconds()).padStart(3, "0").substr(0, 3)
            + offsetSign + pad(offset / 60) + pad(offset % 60);
    }

}

/**
 * JIRA issue visualisation functions.
 *
 * Most of this object is stateless functions
 * with the exception of currently visualised JIRA issue,
 * because it is repeatedly accessed when user changes
 * the working time to update the worklog bar.
 */
class IssueVisual {

    constructor() {
        IssueVisual.init();
    }

    /**
     * Install JIRA issue GUI into the worklog dialog.
     * Checks whether the GUI has already been added before
     * making any DOM changes, so repeated calls have no effect.
     */
    static init() {
        if (document.getElementById('jira-toolbar-envelope')) {
            console.log("JIRA toolbar was already added to form.");
            return;
        }
        IssueVisual.addToForm();
    }

    /**
     * Adds jira issue GUI to the time sheet form.
     */
    static addToForm() {
        console.log("Adding JIRA toolbar into form");

        const transition = "-webkit-transition: width 0.25s; transition-delay: 0.5s;";
        const trackerStyle = "width: 100%; border-collapse: collapse; height: 0.75em; margin-top: 0.4em;";

        //.uu5-forms-label uu5-forms-input-m
        const jiraBarNode = document.createElement('DIV');
        jiraBarNode.id = 'jira-toolbar-envelope';
        jiraBarNode.innerHTML = (`
        <div>
            <div>
                <span id="parsedJiraIssue" class="uu5-forms-input-m"></span>
            </div>
        </div>
        <div>
            <div>
                <table id="jiraWorkTrackerOriginal" style="${trackerStyle}">
                  <tbody>
                    <tr>
                      <td class="workTracker wtl" id="jiraOrigEstimate" title="Původní odhad:" style="background-color: #89AFD7; padding: 0; ${transition} width: 0;"></td>
                      <td class="workTracker wtr" id="jiraRemainEstimate" title="Zbývající odhad:" style="background-color: #ec8e00; padding: 0; ${transition} width: 0;"></td>
                      <td class="workTracker wt" title="Původní odhad" style="background-color: #cccccc; padding: 0; ${transition} width: 100%"></td>
                    </tr>
                  </tbody>
                </table>
                <table id="jiraWorkTrackerLogged" style="${trackerStyle}">
                  <tbody>
                    <tr>
                      <td class="workTracker wtl" id="jiraWorkLogged" title="Vykázáno:" style="background-color: #51a825; padding: 0; ${transition} width: 0;"></td>
                      <td class="workTracker wtn" id="jiraWorkLogging" title="Nový výkaz" style="background-color: #51A82580; padding: 0; /*${transition}*/ width: 0"></td>
                      <td class="workTracker wtr" id="jiraWorkRemainTotal" title="Zbývá" style="background-color: #cccccc; padding: 0; /*${transition} */width: 100%"></td>
                    </tr>
                  </tbody>
                </table>
            </div>
            <div>
                <span id="parsedJiraIssue"></span>
            </div>
        </div>
        <div style="margin-top: 10px">
            <button id="jiraLogWorkButton" class="uu5-bricks-button-m uu6-bricks-button-filled" type="button" style="border: none" disabled>
                <span class="uu5-bricks-span uu5-bricks-lsi-item uu5-bricks-lsi">Vykázat na <u>J</u>IRA issue</span>
            </button>
            <span id="jira-issue-work-log-request-progress" style="margin-left: 8px;"></span>
        </div>
        `);
        IssueVisual.insertAfter(jiraBarNode, WtmDialog.highRateNode());
    }


    static insertAfter(newNode, referenceNode) {
        referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
    }

    /**
     * Display a loaded JIRA issue in the form as a link
     * and update the time tracker.
     *
     * @param {JiraIssue} issue The JIRA issue object as fetched from JIRA rest API
     */
    static async showIssue(issue) {
        const domain = issue.self.slice(0, issue.self.indexOf(jiraRestApiPath));
        const url = await jiraBrowseIssueUrl(issue.key)(domain);
        IssueVisual.$showInIssueSummary(IssueVisual.linkHtml(url, `${issue.key} - ${issue.fields.summary}`));
        IssueVisual.trackWorkOf(issue);
    }

    /**
     * Displays some fancy animation at the place of the JIRA issue summary.
     */
    static showIssueLoadingProgress() {
        IssueVisual.$showInIssueSummary(jiraIssueLoaderAnimation);
        IssueVisual.resetWorkTracker();
    }

    /**
     * Sets the currently displayed JIRA issue to null and resets all the visualisation.
     */
    static resetIssue() {
        IssueVisual.resetWorkTracker();
    }

    /**
     * Display a visual work log time tracker of the current JIRA issue in the form.
     */
    static updateWorkTracker() {
        if (IssueVisual._issue) {
            const issue = IssueVisual._issue;
            const orig = issue.fields.timetracking.originalEstimateSeconds || 0;
            const remain = issue.fields.timetracking.remainingEstimateSeconds || 0;
            const logged = issue.fields.timetracking.timeSpentSeconds || 0;
            const added = WtmDialog.getDurationSeconds();
            const total = Math.max(orig + remain, logged + added);
            const percentOfTotal = (x) => total > 0 ? x / total * 100 : 0;
            const setWidth = (id, w) => {
                document.getElementById(id).style.width = `${Math.round(w)}%`;
            };
            const setTitle = (id, t) => {
                const e = document.getElementById(id);
                e.title = e.title.split(':')[0] + ': ' + t || "0h";
                e.alt = e.title;
            };
            setWidth('jiraOrigEstimate', percentOfTotal(orig));
            setTitle('jiraOrigEstimate', issue.fields.timetracking.originalEstimate);
            setWidth('jiraRemainEstimate', percentOfTotal(remain));
            setTitle('jiraRemainEstimate', issue.fields.timetracking.remainingEstimate);
            setWidth('jiraWorkLogged', percentOfTotal(logged));
            setTitle('jiraWorkLogged', issue.fields.timetracking.timeSpent);
            setWidth('jiraWorkLogging', percentOfTotal(added));
            setTitle('jiraWorkLogging', added / 3600 + 'h');
            const remainTotal = 100 - percentOfTotal(logged + added);
            setWidth('jiraWorkRemainTotal', remainTotal);
            const remainCell = document.getElementById('jiraWorkRemainTotal');
            remainCell.style.display = (remainTotal === 0 && percentOfTotal(added) !== 0) ? "none" : null;//Chrome renders zero width as 1px
        }
        else
            IssueVisual.resetWorkTracker();
    }

    /**
     * Sets currently displayed JIRA issue for the time tracker bar.
     * This is the only state held by IssueVisual class.
     *
     * @typedef JiraIssue
     * @property {string} key The key of the JIRA issue, e.g. XYZ-1234
     * @property {string} fields.summary The JIRA issue summary, i.e. the title of the ticket.
     * @property {string} self JIRA link to this issue.
     * @property {?number} fields.timetracking.originalEstimateSeconds
     * @property {?number} fields.timetracking.remainingEstimateSeconds
     * @property {?number} fields.timetracking.timeSpentSeconds
     * @property {?number} fields.timetracking.originalEstimate
     * @property {?number} fields.timetracking.remainingEstimate
     * @property {?number} fields.timetracking.timeSpent
     *
     * @param {?JiraIssue} issue
     */
    static trackWorkOf(issue = null) {
        IssueVisual._issue = issue;
        IssueVisual.updateWorkTracker();
    }

    /**
     * No JIRA issue is displayed, no work time is tracked.
     */
    static resetWorkTracker() {
        IssueVisual._issue = null;
        document.getElementById('jiraOrigEstimate').style.width = `0%`;
    }

    /**
     * Displays default content when no issue has been loaded.
     */
    static showIssueDefault() {
        IssueVisual.$showInIssueSummary(`<span>Zadejte kód JIRA Issue na začátek Popisu činnosti.</span>`);
        IssueVisual.resetIssue();
    }

    /**
     * Handles JIRA issue loading errors.
     * Updates GUI accordingly.
     *
     * @param {string} key JIRA issue
     * @param {InvalidResponse|InvalidProjectError|ProjectLoadingError|Error} error
     */
    issueLoadingFailed(key, error) {
        IssueVisual.resetIssue();

        function tryGetProjectUrl() {
            return Jira4U.getProjectCode(key)
                .then(Jira4U.getJiraUrlForProject)
                .then(jiraBrowseIssueUrl(key));
        }

        function getErrorMessages(responseErr) {
            if (/content-type:\sapplication\/json/.test(responseErr.responseHeaders)) {
                let error = JSON.parse(responseErr.responseText);
                return Promise.of(error.errorMessages ? ' Chyba: ' + error.errorMessages.join(', ') : '');
            }
            return Promise.reject(responseErr);
        }

        if (error instanceof InvalidResponse) {
            const status = error.response.status;
            if (status === 401 || status === 403) {
                tryGetProjectUrl()
                    .then(url =>
                        IssueVisual.$showInIssueSummary(`JIRA autentizace selhala. ${IssueVisual.linkHtml(url, 'Přihlaste se do JIRA.')}`)
                    )
                    .catch(_ => {
                        console.error('Failed to resolve url for issue ' + key);
                        IssueVisual.$showInIssueSummary(
                            `JIRA autentizace selhala.<br>
Přihlaste se do ${IssueVisual.linkHtml(jiraEuUrl, 'jira.unicorn.eu')} nebo ${IssueVisual.linkHtml(jiraComUrl, 'jira.unicorn.com')}.`);
                    });
            } else if (status === 404) {
                getErrorMessages(error.response)
                    .then(msg => IssueVisual.$showInIssueSummary(`<span>Nepodařilo se načíst ${key}.${msg}.</span>`))
                    .catch(err =>
                        error(`Failed to load issue ${key}. Response: ${err}`)
                            .then(_ => IssueVisual.$showInIssueSummary(`<span>Nepodařilo se načíst ${key}. Chyba: 404</span>`)));
            }
        } else if (error instanceof InvalidProjectError) {
            IssueVisual.$showInIssueSummary(`<span>Projekt ${error.projectKey} neexistje.</span>`);
        } else if (error instanceof ProjectLoadingError) {
            IssueVisual.$showInIssueSummary(`<span>Nepodařilo se načist projekt ${error.projectKey}.</span>`);
        } else {
            const unknownError = () => IssueVisual.$showInIssueSummary(`<span>Něco se přihodilo. Budete muset ${IssueVisual.linkHtml(jiraEuUrl, 'vykázat do JIRA ručně.')}'</span>`);
            if (error.stack) {
                unknownError();
                throw error;
            }
            error('Unknown error: ' + error)
                .then(unknownError);
        }
    }

    static linkHtml(href, label) {
        return `<a href="${href}" target="_blank">${label}</a>`;
    };

    static $jiraIssueSummary() {
        return $(document.getElementById("parsedJiraIssue"));
    }

    /**
     * Replaces content of the placeholder element for the JIRA issue summary.
     * Returns the element, wrapped as a jQuery object for easier content manipulation.
     *
     * @return {jQuery|HTMLElement}
     */
    static $showInIssueSummary(htmlContent) {
        const issueSummary = this.$jiraIssueSummary();
        issueSummary.empty().append(htmlContent);
        return issueSummary;
    }

    /**
     * Display a sign next to the JIRA button
     * to show state of writing the work log record.
     *
     * @param {'loading'|'done'|'error'|'idle'} state Issue loading state.
     * @return {HTMLElement}
     */
    static showJiraIssueWorkLogRequestProgress(state) {
        const stateViews = {
            'loading': jiraIssueLoaderAnimation,
            'done': `✔`,
            'error': `❌`,
            'idle': ``
        };
        const logProgress = document.getElementById("jira-issue-work-log-request-progress");
        logProgress.innerHTML = stateViews[state] || stateViews['idle'];
        return logProgress;
    }

    /**
     * @return {HTMLElement} Log work button
     */
    static jiraLogWorkButton() {
        return document.getElementById('jiraLogWorkButton');
    }

}

/**
 * Container for a JIRA issue key + description.
 * It can construct itself by parsing the issue key from work description.
 */
class WorkDescription {

    constructor(issueKey = null, descriptionText = "") {
        this._issueKey = issueKey;
        this._descriptionText = descriptionText;
    }

    static parse(workDescriptionText) {
        if (typeof workDescriptionText === "string") {
            let segments = workDescriptionText.match(jiraIssueKeyPattern);
            if (segments != null) {
                let key = segments[1];
                return new WorkDescription(key, workDescriptionText.replace(key, "").trim());
            }
        }
        return new WorkDescription();
    }

    get issueKey() {
        return this._issueKey;
    }

    get descriptionText() {
        return this._descriptionText;
    }
}

class FlowBasedConfiguration {

    static resolveArtefact(jiraIssue) {
        if (FlowBasedConfiguration.isFlowBasedJira(jiraIssue)) {
            if (FlowBasedConfiguration.isIdccProject(jiraIssue)) {
                if (jiraIssue.type === "Change Request") {
                    return "UNI-BT:USYE.IDCC/CR";
                } else {
                    return "UNI-BT:USYE.IDCC/IDCC_MAINSCOPE";
                }
            } else {
                if (jiraIssue.projectCode) {
                    if (jiraIssue.projectCode.startsWith("UNI-BT:")) {
                        return jiraIssue.projectCode;
                    } else {
                        return "UNI-BT:" + jiraIssue.projectCode;
                    }
                }
            }
        }
        return null;
    }


    static isFlowBasedJira(jiraIssue) {
        return jiraIssue.issueKeyPrefix === "FBLI" || jiraIssue.issueKeyPrefix === "FBCE";
    }

    static isIdccProject(jiraIssue) {
        return jiraIssue.system === "FB IDCC";
    }
}

/**
 * Wraps the rest of the script, mainly the steps that are executed when the document is loaded.
 */
class P4uWorklogger {

    constructor() {
        // Initialize the page decoration.
        this.issueVisual = null;
        this._previousDesctiptionValue = null;
        this._previousIssue = null;
    }

    workLogFormShow() {
        this.issueVisual = this.issueVisual || new IssueVisual();
        IssueVisual.init();
        this._previousDesctiptionValue = WtmDialog.descArea().value;
        this._previousIssue = Jira4U.tryParseIssue(this._previousDesctiptionValue);
        this.doTheMagic();
    }

    doTheMagic() {
        IssueVisual.showIssueDefault();

        WtmDialog.timeFrom().onblur = IssueVisual.updateWorkTracker;
        WtmDialog.timeTo().onblur = IssueVisual.updateWorkTracker;

        //Chrome fires DOM events for textContent changes even during typing, FF does not.
        //So we add input listener and paranoidly make sure we do not add it more than once.
        const descriptionChangeListener = ev => workLogger.checkWorkDescriptionChanged(ev.target.value);
        WtmDialog.descArea().removeEventListener('input', descriptionChangeListener);
        WtmDialog.descArea().addEventListener('input', descriptionChangeListener);
        //In case of a Work log update, there may already be some work description.
        if (WtmDialog.descArea().value) {
            const wd = Jira4U.tryParseIssue(WtmDialog.descArea().value);
            this.loadJiraIssue(wd);
        }

        const jiraLogWorkButton = IssueVisual.jiraLogWorkButton();
        jiraLogWorkButton.removeEventListener('click', P4uWorklogger.writeWorkLogToJira);
        jiraLogWorkButton.addEventListener('click', P4uWorklogger.writeWorkLogToJira);
        P4uWorklogger.registerKeyboardShortcuts();
    }

    static registerKeyboardShortcuts() {
        WtmDialog.registerKeyboardShortcuts();

        const timeControlTitle = 'Použijte šipky ⬆⬇ pro změnu času';
        WtmDialog.timeFrom().addEventListener('keydown', P4uWorklogger.shiftTime);
        WtmDialog.timeFrom().title = timeControlTitle;
        WtmDialog.timeTo().addEventListener('keydown', P4uWorklogger.shiftTime);
        WtmDialog.timeTo().title = timeControlTitle;
    }

    static fillArtefactIfNeeded(rawJiraIssue) {
        const artefactField = WtmDialog.artifactField();
        if (!artefactField.value) {
            let jiraIssue = P4uWorklogger.mapToHumanJiraIssue(rawJiraIssue);
            let artefact = FlowBasedConfiguration.resolveArtefact(jiraIssue);
            if (artefact) {
                artefactField.value = artefact;
                //Let the form notice the value update, otherwise the artifact is not submitted
                artefactField.focus();
                artefactField.blur();
            }
        }
    }

    static mapToHumanJiraIssue(rawJiraIssue) {
        let humanReadableIssue = {};
        const fieldValue = (field) => field ? field.value : null;
        humanReadableIssue.projectCode = fieldValue(rawJiraIssue.fields.customfield_10174);
        humanReadableIssue.system = fieldValue(rawJiraIssue.fields.customfield_12271);
        humanReadableIssue.type = rawJiraIssue.fields.issuetype.name;
        humanReadableIssue.issueKeyPrefix = rawJiraIssue.fields.project.key;
        return humanReadableIssue;
    }

    static getTimeAdjustmentDirection(ev) {
        if (ev.key === 'ArrowDown') {
            return -1;
        } else if (ev.key === 'ArrowUp') {
            return 1;
        } else {
            return 0;
        }
    }

    /**
     * Updates selected work log range time based on arrow up|down key press.
     * @param {Event} ev The keyboard event.
     */
    static shiftTime(ev) {
        const input = ev.target;
        if (input.nodeName !== 'INPUT') {
            console.warn('Cannot shift selected time, element is not an input: ', input);
            return;
        }
        const timeAdjustment = P4uWorklogger.getTimeAdjustmentDirection(ev);
        if (timeAdjustment === 0) {
            return;
        }
        ev.preventDefault();
        //If the value is empty, try the other period boundary. This allows just adding time in an empty input.
        const value = input.value || WtmDialog.timeFrom().value || WtmDialog.timeTo().value;
        if (value) {
            const selectionStart = input.selectionStart;
            const selectionEnd = input.selectionEnd;
            const selectionDirection = input.selectionDirection;
            const cursorPosition = selectionDirection === 'backward' ? selectionStart : selectionEnd;
            input.value = P4uWorklogger.updateTime(timeAdjustment, cursorPosition, value);
            input.selectionStart = selectionStart;
            input.selectionEnd = selectionEnd;
            input.selectionDirection = selectionDirection;
        }
    }

    /**
     * Updates hours or minutes of time represented as HH:mm string.
     * @param {number} adjustmentDirection Positive or negative number. Should be -1 or 1.
     * @param {number} cursorPosition Index of the caret. Decides whether to change hours or minutes.
     * @param {string} timeInputValue Time string in the input box
     * @return {string} Shifted and formatted time
     */
    static updateTime(adjustmentDirection, cursorPosition, timeInputValue) {
        const timeRegExp = /(\d{1,2}):(\d{1,2})/;
        if (!timeRegExp.test(timeInputValue)) {
            console.debug(`Invalid time format, cannot adjust time "${timeInputValue}"`);
            return timeInputValue;
        }
        const dateTime = WtmDateTime.parseDateTime(WtmDialog.datePicker().value, timeInputValue);
        const pad = WtmDateTime.padToDoubleDigit;
        const formatTime = (date) => pad(date.getHours()) + ':' + pad(date.getMinutes());
        if (cursorPosition <= timeInputValue.indexOf(':')) {
            return formatTime(WtmDateTime.addHours(dateTime, adjustmentDirection));
        } else {
            return formatTime(WtmDateTime.addMinutes(dateTime, 15 * adjustmentDirection));
        }
    }

    static writeWorkLogToJira() {
        console.debug(new Date().toISOString(), 'Adding a work log item.');
        const wd = Jira4U.tryParseIssue(WtmDialog.descArea().value);
        if (!wd.issueKey) {
            return;
        }
        IssueVisual.jiraLogWorkButton().disabled = true;
        const durationSeconds = WtmDialog.getDurationSeconds();
        if (durationSeconds <= 0) {
            return 0;
        }
        const dateFrom = WtmDialog.dateFrom();
        console.log(`Logging ${durationSeconds} minutes of work on ${wd.issueKey}`);
        Jira4U.logWork({
            key: wd.issueKey,
            started: dateFrom,
            duration: durationSeconds,
            comment: wd.descriptionText,
            onReadyStateChange: function (state) {
                console.debug("Log work request state changed to: " + state.readyState);
                if (state === 1) {
                    IssueVisual.showJiraIssueWorkLogRequestProgress('loading');
                }
            }
        }).then(res => {
            console.info("Work was successfully logged to JIRA.", JSON.parse(res.responseText));
            IssueVisual.showJiraIssueWorkLogRequestProgress('done');
            //The buttons are probably refreshed. They loose their enhancements after adding a worklog.
            setTimeout(() => {
                P4uWorklogger.registerKeyboardShortcuts();
                IssueVisual.jiraLogWorkButton().disabled = false;
            }, 500);
        }, err => {
            console.warn("Failed to log work to JIRA. ", err);
            IssueVisual.showJiraIssueWorkLogRequestProgress('error');
            IssueVisual.jiraLogWorkButton().disabled = false;
        });
    }

    checkWorkDescriptionChanged(description) {
        if (this._previousDesctiptionValue !== description) {
            this._previousDesctiptionValue = description;
            this.workDescriptionChanged(description);
        } else console.debug("No description change")
    }

    /**
     * @param {string} description The new work description value
     */
    workDescriptionChanged(description) {
        const wd = Jira4U.tryParseIssue(description);
        if (this._previousIssue.issueKey === null || this._previousIssue.issueKey !== wd.issueKey) {
            this._previousIssue = wd;
            this.loadJiraIssue(wd);
        }
    }

    loadJiraIssue(wd) {
        IssueVisual.jiraLogWorkButton().disabled = true;
        IssueVisual.showJiraIssueWorkLogRequestProgress('idle');
        if (!wd.issueKey) {
            IssueVisual.showIssueDefault();
            return;
        }

        let key = wd.issueKey;
        console.debug("JIRA issue key recognized: ", key);
        const showLoadingProgress = progress => {
            console.info(`Loading jira issue ${key}, state: ${progress.readyState}`);
            if (progress.readyState === 1) {
                IssueVisual.showIssueLoadingProgress();
            }
        };

        Jira4U.loadIssue(key, showLoadingProgress)
            .then(tee(_ => log(`Loading of issue ${key} completed.`)))
            //Getting into the onload function does not actually mean the status was OK
            .then(Jira4U.validateStatusOk)
            .then(tee(_ => log(`Issue ${key} loaded successfully.`)))
            .then(Jira4U.parseResponse)
            .then(tee(IssueVisual.showIssue))
            .then(tee(_ => IssueVisual.jiraLogWorkButton().disabled = false))
            .then(P4uWorklogger.fillArtefactIfNeeded)
            .catch(responseErr => {
                console.log(`Failed to load issue ${key}. Error: ${responseErr}`);
                this.issueVisual.issueLoadingFailed(key, responseErr);
            });
    }
}

/**
 * Adds month selection buttons.
 */
class MonthSelector {
    static getMonthSelectorContainer() {
        return document.querySelector('.uu-specialistwtm-worker-monthly-detail-top-change-month-dropdown');
    }
    static getMonthSelector() {
        return this.getMonthSelectorContainer().firstElementChild;
    }
    static getMonthSelectorButton() {
        return this.getMonthSelector().querySelector('button');
    }

    static getSelectedMonthValue() {
        return this.getMonthSelectorButton().querySelector('.uu-specialistwtm-worker-monthly-detail-top-month-dropdown-value').innerText;
    }

    install() {
        if (MonthSelector.getMonthSelectorContainer().querySelector('span.wtm-month-switch-button-icon')) {
            return;
        }
        const createArrow = (direction) => {
            const arrow = document.createElement('SPAN');
            arrow.classList.add('wtm-month-switch-button-icon', 'uu5-bricks-button', 'uu5-bricks-button-inverted', 'mdi', 'mdi-chevron-' + direction);
            return arrow;
        };

        /**
         * Creates the month switching callback, which is called after the dropdown menu is shown.
         * The menu is a div containing an UL element. This list is searched for the current month by the displayed text.
         * Index of the selected list item is updated and the neighbor item is clicked.
         *
         * @param selectedMonthText
         * @return {function(*): Function}
         */
        const selectMonth = (selectedMonthText) => (monthIndexFn) => () => {
            const dropDown = MonthSelector.getMonthDropDown();
            if (!dropDown) {
                console.warn('Month drop-down menu does not exist.');
                return;
            }
            const selectedMonthIndex = Array
                .from(dropDown.children)
                .findIndex(li => li.innerText.trim() === selectedMonthText);
            if (selectedMonthIndex < 0) {
                console.debug('Cannot find selected month:', selectedMonthText);
                return;//May leave the menu opened? It may actually be desirable as a fallback scenario.
            }
            const newMonthIndex =
                Math.max(0,
                    Math.min(dropDown.children.length - 1,
                        monthIndexFn(selectedMonthIndex)))
                || selectedMonthIndex;
            dropDown.children[newMonthIndex].firstChild.click();//LI contains an A element
        };

        const arrowClickHandler = (monthIdxUpdateFn) => (event) => {
            console.trace('WTM Extension', 'Click:', event);
            //Show the months dropdown
            MonthSelector.getMonthSelectorButton().click();
            //Allow browser to render the menu, then click desired month
            setTimeout(selectMonth(MonthSelector.getSelectedMonthValue())(monthIdxUpdateFn), 0);
        };

        const arrowLeft = createArrow('left');
        arrowLeft.onclick = arrowClickHandler(i => i + 1);//Months are in the reversed order
        arrowLeft.title = _t('wtm.month.prev.title');

        const arrowRight = createArrow('right');
        arrowRight.onclick = arrowClickHandler(i => i - 1);
        arrowRight.title = _t('wtm.month.next.title');

        const monthSelector = MonthSelector.getMonthSelector();
        monthSelector.insertBefore(arrowLeft, monthSelector.firstChild);
        monthSelector.appendChild(arrowRight);
    }

    static getMonthDropDown() {
        return MonthSelector.getMonthSelectorContainer().querySelector('ul.uu5-bricks-dropdown-menu-list');
    }
}

const workLogger = new P4uWorklogger();
const monthSelector = new MonthSelector();

class WtmDomObserver {

    constructor() {
        this.observeOptions = {
            attributes: false,
            characterData: false,
            childList: true,
            subtree: true,
            attributeOldValue: false,
            characterDataOldValue: false,
        };
        this.mutationObserver = null;
        this.pageReadyMutationOberver = null;
    }

    observe() {
        const hasAddedNodes = (mutation) => mutation.addedNodes.length > 0;
        const isWorkDescription = (mutation) => mutation.target.type === 'textarea' && mutation.target.name === 'description';
        const isWorkLogForm = (mutation) => affectsNodesWithClass(mutation, 'uu5-bricks-modal-body', 'uu-specialistwtm-create-timesheet-item-modal-container');
        const isWorkTable = (mutation) => affectsNodesWithClass(mutation, 'uu-specialistwtm-worker-monthly-detail-container', 'uu-specialistwtm-worker-monthly-detail-table');

        const affectsNodesWithClass = (mutation, targetNodeClass, childNodeClass) => {
            if (!mutation.target.classList.contains(targetNodeClass)) {
                return false;
            }
            for (const childNode of mutation.target.childNodes) {
                if (childNode.classList.contains(childNodeClass)) {
                    return true;
                }
            }
            return false;
        };

        this.mutationObserver = new MutationObserver(function (mutations) {
            mutations
            // .filter(hasAddedNodes)
                .forEach((mutation) => {
                    // console.log(mutation); //I expect to use this functionality frequently
                    if (isWorkDescription(mutation)) {
                        workLogger.checkWorkDescriptionChanged(mutation.target.textContent);
                    }
                    if (isWorkLogForm(mutation)) {
                        workLogger.workLogFormShow();
                    } else if (mutation.target.classList.contains('uu-specialistwtm-create-timesheet-item-buttons-save')) {
                        console.debug('Buttons changed, re-applying extension.');
                        P4uWorklogger.registerKeyboardShortcuts();
                    }
                    if (isWorkTable(mutation)) {
                        WtmWorktableView.worktableSumViewShow();
                    }

                    if (MonthSelector.getMonthSelectorContainer()) {
                        monthSelector.install();
                    }
                });
        });

        //During page loading, there are tons of mutations. This observer is active until the main page is added, then it disconnects and activates the actual observer.
        this.pageReadyMutationOberver = new MutationObserver(function (mutations) {
            const isMainPageAddition = (mutation) => hasAddedNodes(mutation) && mutation.type === 'childList' && mutation.target.matches('div.uu5-common-div.uu5-bricks-page-system-layer.plus4u5-app-page-system-layer-wrapper');
            if (mutations.some(isMainPageAddition)) {
                swapObservers();
            }
        });

        let swapObservers = () => {
            if (this.pageReadyMutationOberver) {
                this.pageReadyMutationOberver.disconnect();
            }
            this.mutationObserver.observe(document.body, this.observeOptions);
        };
        this.pageReadyMutationOberver.observe(document.body, this.observeOptions);
    }
}

const brickObserver = new WtmDomObserver();
brickObserver.observe();
