// ==UserScript==
// @name         p4u-worklogger
// @description  JIRA work log in UU
// @version      2.1.2
// @namespace    https://uuos9.plus4u.net/
// @author       bubblefoil
// @license      MIT
// @require      https://code.jquery.com/jquery-3.2.1.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      jira.unicorn.eu
// @match        https://uuos9.plus4u.net/uu-specialistwtmg01-main/*
// @run-at       document-idle
// ==/UserScript==

//Test issue - FBLI-7870
const jiraUrl = 'https://jira.unicorn.eu';
const jiraBrowseIssue = jiraUrl + "/browse";
const jiraRestApiUrl = jiraUrl + '/rest/api/2';
const jiraRestApiUrlIssue = jiraRestApiUrl + '/issue';
const jiraIssueKeyPattern = /([A-Z]+-\d+)/;

class PageCheck {

    isWorkLogFormPage() {
        //Check that the work log page is loaded by querying for some expected elements
        if (document.title !== 'Working Time Management') {
            console.log("Judging by the page title, this does not seem to be the Working Time Management app. Exiting extension script.");
            return false;
        }
        return true;
    }
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
            .replace(issueKeyPatternGlobal, `<a href="${jiraBrowseIssue}/$1" target="_blank">$1</a>`);
    }
}

let pageCheck = new PageCheck();
if (!pageCheck.isWorkLogFormPage()) {
    // noinspection JSAnnotator
    return;
}
const wtmMessage = {
    cs: {
        'wtm.table.day-range.label': 'ČAS MEZI DNY:',
    },
    en: {
        'wtm.table.day-range.label': 'TIME BETWEEN DAYS:'
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
        console.warn(`I18N message "${messageCode}" is not defined for "${WtmWorktableModel.language()}`);
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
        const dateMatch = selectedDate.match(/(\d\d)[\.|/](\d\d)[\.|/](\d{4})/);
        const dateFields = dateMatch && dateMatch.slice(1).map(Number) || [NaN, NaN, NaN];
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

    worktableSumViewShow() {
        if (document.getElementById('wtt-time-range-form')) {
            console.log('WTM Extension: Work table already enhanced.');
            this.updateSum();
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
                `<div id="wtt-time-range-form" class="uu5-common-div uu-specialistwtm-worker-monthly-detail-top-time-column">
                <span class="uu5-bricks-span uu5-bricks-lsi-item uu5-bricks-lsi uu-specialistwtm-worker-monthly-detail-top-total-time-label" style="width: max-content; min-width: 8em;">${_t('wtm.table.day-range.label')}</span>
                <input class="uu5-bricks-text uu5-common-text uu-specialistwtm-worker-monthly-detail-table-form-date" type="number" id="wtt-day-from" value="${lastMonday}" min="1" max="31" style="width: 4em; margin: 0.25em">
                <input class="uu5-bricks-text uu5-common-text uu-specialistwtm-worker-monthly-detail-table-form-date" type="number" id="wtt-day-to" value="${nextSunday}" min="1" max="31" style="width: 4em; margin: 0.25em">
                <span id="wtt-time-in-range-sum" class="uu5-bricks-span uu-specialistwtm-worker-monthly-detail-top-total-time">${WtmWorktableView.formatToHours(0)}</span>
                </div>`
            );
        this.getDayFromInput().onchange = () => this.updateSum();
        this.getDayFromInput().onclick = () => this.updateSum();
        this.getDayToInput().onchange = () => this.updateSum();
        this.getDayToInput().onclick = () => this.updateSum();
        this.updateSum().catch((e) => console.warn(e));
    }

    getDayToInput() {
        return document.getElementById('wtt-day-to');
    }

    getDayFromInput() {
        return document.getElementById('wtt-day-from');
    }

    async updateSum() {
        const dFrom = Number(this.getDayFromInput().value);
        const dTo = Number(this.getDayToInput().value);
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
    }

    /** Adds mnemonics (access keys) to the form buttons. */
    static registerAccessKeys() {
        this.addMnemonic(document.getElementById('form-btn-next-day_label'), "n");
        this.addMnemonic(document.getElementById('form-btn-next_label'), "p");
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
 * JIRA API connector.
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
     * @param {string} key JIRA issue key string
     * @param {Function} onload
     * @param {Function} onerror
     * @param {?Function} onprogress Optional loading progress callback
     */
    loadIssue(key, onload, onerror, onprogress) {
        // noinspection JSUnresolvedFunction
        GM_xmlhttpRequest(
            {
                method: 'GET',
                headers: {"Accept": "application/json"},
                url: jiraRestApiUrlIssue.concat("/", key),
                onreadystatechange: onprogress || function (res) {
                    console.log("Request state: " + res.readyState);
                },
                onload: onload,
                onerror: onerror
            }
        );
    }

    /**
     * @param {string} workInfo.key JIRA issue key string.
     * @param {Date} workInfo.started The date/time the work on the issue started.
     * @param {number} workInfo.duration in seconds.
     * @param {string} workInfo.comment The work log comment.
     * @param {Function} [workInfo.onSuccess] Callback to be invoked on response from JIRA.
     * @param {Function} [workInfo.onError] Callback to be invoked in case the JIRA request fails.
     * @param {Function} [workInfo.onReadyStateChange] Callback to be invoked when the request state changes.
     */
    logWork(workInfo) {
        console.log(`Sending a work log request. Issue=${workInfo.key}, Time spent=${workInfo.duration}minutes, Comment="${workInfo.comment}"`);
        // noinspection JSUnresolvedFunction
         GM_xmlhttpRequest(
            {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                    //Disable the cross-site request check on the JIRA side
                    "X-Atlassian-Token": "nocheck",
                    //Previous header does not work for requests from a web browser
                    "User-Agent": "xx"
                },
                data: `{
                        "timeSpentSeconds": ${workInfo.duration},
                        "started": "${this.toIsoString(workInfo.started)}",
                        "comment": "${workInfo.comment}"
                    }`,
                url: jiraRestApiUrlIssue.concat("/", workInfo.key, "/worklog"),
                onreadystatechange: workInfo.onReadyStateChange,
                onload: workInfo.onSuccess,
                onerror: workInfo.onError
            }
        );
    }

    /**
     * Converts a date to a proper ISO formatted string, which contains milliseconds and the zone offset suffix.
     * No other date formats are recognized by JIRA.
     * @param {Date} date Valid Date object to be formatted.
     * @returns {string}
     */
    toIsoString(date) {
        let offset = -date.getTimezoneOffset(),
            offsetSign = offset >= 0 ? '+' : '-',
            pad = function (num) {
                const norm = Math.floor(Math.abs(num));
                return (norm < 10 ? '0' : '') + norm;
            };
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
 */
class IssueVisual {
    constructor() {
        this._jiraLogWorkEnabledValue = "p4u.jira.worklog.enabled";
        const $parsedJiraIssue = $("#parsedJiraIssue");
        if ($parsedJiraIssue.length === 0) {
            this.addToForm();
        }
        this._jiraLogWorkEnabled = document.getElementById("jiraLogWorkEnabled");
        this._issue = null;
    }

    /**
     * Adds jira issue container to the form.
     */
    addToForm() {
        // noinspection JSUnresolvedFunction
        const logWorkEnabled = GM_getValue(this._jiraLogWorkEnabledValue, true);
        const checked = logWorkEnabled ? `checked="checked"` : '';
        console.log("Adding JIRA Visual into form");
        // noinspection CssUnknownTarget

        const transition = "-webkit-transition: width 0.25s; transition-delay: 0.5s;";
        const trackerStyle = "width: 100%; border-collapse: collapse; height: 0.75em; margin-top: 0.4em;";

        //.uu5-forms-label uu5-forms-input-m
        const jiraBarNode = document.createElement('div');
        jiraBarNode.innerHTML = (`
        <div>
            <div>
                <input type="checkbox" id="jiraLogWorkEnabled" ${checked} accesskey="j" style=" margin-bottom: 3px; vertical-align: bottom; ">
                <label for="jiraLogWorkEnabled" class="uu5-forms-input-m">Vykázat na <u>J</u>IRA issue</label>
            </div>
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
        `);
        IssueVisual.insertAfter(jiraBarNode, WtmDialog.highRateNode());
        const logWorkEnableCheckbox = document.getElementById("jiraLogWorkEnabled");
        logWorkEnableCheckbox.onclick = () => {
            // noinspection JSUnresolvedFunction
            GM_setValue(this._jiraLogWorkEnabledValue, logWorkEnableCheckbox.checked);
            this.trackWork();//To reset the added work log on the tracker
        };
    }

    static insertAfter(newNode, referenceNode) {
        referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
    }

    isJiraLogWorkEnabled() {
        return this._jiraLogWorkEnabled.checked;
    }

    /**
     * Display a loaded JIRA issue in the form as a link.
     * @param issue The JIRA issue object as fetched from JIRA rest API
     * @param {string} issue.key The key of the JIRA issue, e.g. XYZ-1234
     * @param {string} issue.fields.summary The JIRA issue summary, i.e. the title of the ticket.
     */
    showIssue(issue) {
        this._issue = issue;
        IssueVisual.$jiraIssueSummary().empty().append(`<a href="${jiraBrowseIssue}/${issue.key}" target="_blank">${issue.key} - ${issue.fields.summary}</a>`);
        this.trackWork();
    }

    showIssueLoadingProgress() {
        IssueVisual.$jiraIssueSummary().empty().append(`${jiraIssueLoaderAnimation}`);
        this.trackWork();
    }

    /**
     * Sets the currently displayed JIRA issue to null and resets all the visualisation.
     */
    resetIssue() {
        this._issue = null;
        IssueVisual.resetWorkTracker();
    }

    /**
     * Display a visual work log time tracker of the current JIRA issue in the form.
     */
    trackWork() {
        if (this._issue) {
            const orig = this._issue.fields.timetracking.originalEstimateSeconds || 0;
            const remain = this._issue.fields.timetracking.remainingEstimateSeconds || 0;
            const logged = this._issue.fields.timetracking.timeSpentSeconds || 0;
            const added = this.isJiraLogWorkEnabled() ? WtmDialog.getDurationSeconds() : 0;
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
            setTitle('jiraOrigEstimate', this._issue.fields.timetracking.originalEstimate);
            setWidth('jiraRemainEstimate', percentOfTotal(remain));
            setTitle('jiraRemainEstimate', this._issue.fields.timetracking.remainingEstimate);
            setWidth('jiraWorkLogged', percentOfTotal(logged));
            setTitle('jiraWorkLogged', this._issue.fields.timetracking.timeSpent);
            setWidth('jiraWorkLogging', percentOfTotal(added));
            const remainTotal = 100 - percentOfTotal(logged + added);
            setWidth('jiraWorkRemainTotal', remainTotal);
            const remainCell = document.getElementById('jiraWorkRemainTotal');
            remainCell.style.display = (remainTotal === 0 && percentOfTotal(added) !== 0) ? "none" : null;//Chrome renders zero width as 1px
        }
        else
            IssueVisual.resetWorkTracker();
    }

    static resetWorkTracker() {
        document.getElementById('jiraOrigEstimate').style.width = `0%`;
    }

    /**
     * The default content to be displayed when no issue has been loaded.
     */
    showIssueDefault() {
        IssueVisual.$jiraIssueSummary().empty().append(`<span>Zadejte kód JIRA Issue na začátek Popisu činnosti.</span>`);
        this.resetIssue();
    }

    issueLoadingFailed(responseDetail) {
        this.resetIssue();
        let responseErr = responseDetail.response;
        let key = responseDetail.key;
        if (responseErr.status === 401) {
            IssueVisual.$jiraIssueSummary().empty().append(`JIRA autentifikace selhala. <a href="${jiraBrowseIssue}/${key}" target="_blank">Přihlaste se do JIRA.</a>`);
            return;
        }
        if (responseErr.status === 404
            && responseErr.responseHeaders
            && responseErr.responseHeaders.match(/content-type:\sapplication\/json/) != null) {
            let error = JSON.parse(responseErr.responseText);
            if (error.errorMessages) {
                IssueVisual.$jiraIssueSummary().empty().append(`<span>Nepodařilo se načíst issue ${key}. Chyba: ${error.errorMessages.join(", ")}.</span>`);
                return;
            }
        }
        IssueVisual.$jiraIssueSummary().empty().append(`<span>Něco se přihodilo. Budete muset vykázat do JIRA ručně.</span>`);
    }

    static $jiraIssueSummary() {
        return $(document.getElementById("parsedJiraIssue"));
    }

}

/**
 * Container for a JIRA issue key + description. It can construct itself by parsing the issue key from work description.
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
        this.jira4U = new Jira4U();
        this._previousDesctiptionValue = null;
        this._previousIssue = null;
    }

    workLogFormShow() {
        this.issueVisual = new IssueVisual();
        this._previousDesctiptionValue = WtmDialog.descArea().value;
        this._previousIssue = Jira4U.tryParseIssue(this._previousDesctiptionValue);
        this.doTheMagic();
    }

    doTheMagic() {
        this.issueVisual.showIssueDefault();

        const updateWorkTracker = () => this.issueVisual.trackWork();
        WtmDialog.timeFrom().onblur = updateWorkTracker;
        WtmDialog.timeTo().onblur = updateWorkTracker;

        //In case of a Work log update, there may already be some work description.
        if (WtmDialog.descArea().value) {
            const wd = Jira4U.tryParseIssue(WtmDialog.descArea().value);
            this.loadJiraIssue(wd);
        }

        //Intercept form's confirmation buttons.
        this.extendButtons();
    }

    extendButtons() {
        //The callback function cannot be used directly because the context of 'this' in the callback would be the event target.
        WtmDialog.buttonOk().onclick = () => this.writeWorkLogToJiraIfEnabled();
        WtmDialog.buttonNextItem().onclick = () => this.writeWorkLogToJiraIfEnabled();
        WtmDialog.registerKeyboardShortcuts();
        WtmDialog.registerAccessKeys();
    }

    writeWorkLogToJiraIfEnabled() {
        console.debug(new Date().toISOString(), 'Adding a work log item.');
        if (this.issueVisual.isJiraLogWorkEnabled()) {
            this.writeWorkLogToJira();
        }
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

    writeWorkLogToJira() {
        const wd = Jira4U.tryParseIssue(WtmDialog.descArea().value);
        if (!wd.issueKey) {
            return;
        }
        const durationSeconds = WtmDialog.getDurationSeconds();
        if (durationSeconds <= 0) {
            return 0;
        }
        const dateFrom = WtmDialog.dateFrom();
        console.log(`Logging ${durationSeconds} minutes of work on ${wd.issueKey}`);
        this.jira4U.logWork({
            key: wd.issueKey,
            started: dateFrom,
            duration: durationSeconds,
            comment: wd.descriptionText,
            onSuccess: (res) => {
                console.info("Work was successfully logged to JIRA.", JSON.parse(res.responseText));
                //The buttons are probably refreshed. They loose listeners after adding a worklog.
                setTimeout(() => this.extendButtons(), 500);
            },
            onError: (err) => {
                console.warn("Failed to log work to JIRA. ", err);
            },
            onReadyStateChange: function (res) {
                console.debug("Log work request state changed to: " + res.readyState);
            }
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
        if (wd.issueKey) {
            let key = wd.issueKey;
            console.log("JIRA issue key recognized: ", key);
            this.jira4U.loadIssue(wd.issueKey, response => {
                console.log(`Loading of issue ${key} completed.`);
                //Getting into the onload function does not actually mean the status was OK
                if (response.status === 200) {
                    console.log(`Issue ${key} loaded successfully.`);
                    let rawJiraIssue = JSON.parse(response.responseText);
                    this.issueVisual.showIssue(rawJiraIssue);
                    P4uWorklogger.fillArtefactIfNeeded(rawJiraIssue);
                } else {
                    console.log(`Failed to load issue ${key}. Status: ${response.status}`);
                    this.issueVisual.issueLoadingFailed({key, response});
                }
            }, responseErr => {
                console.log(`Failed to load issue ${key}. Status: ${responseErr.status}`);
                this.issueVisual.issueLoadingFailed({key, response: responseErr});
            }, progress => {
                if (progress.readyState === 1) {
                    this.issueVisual.showIssueLoadingProgress();
                }
                console.log(`Loading jira issue ${key}, state: ${progress.readyState}`);
            });
        } else {
            this.issueVisual.showIssueDefault();
        }
    }
}

const workLogger = new P4uWorklogger();
const wtmWorktableView = new WtmWorktableView();

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
                        workLogger.extendButtons();
                    }
                    if (isWorkTable(mutation)) {
                        wtmWorktableView.worktableSumViewShow();
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