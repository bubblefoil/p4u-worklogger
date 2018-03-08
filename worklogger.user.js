// ==UserScript==
// @name         p4u-worklogger
// @description  JIRA work log in UU
// @version      1.1.2
// @namespace    https://plus4u.net/
// @author       bubblefoil
// @license      MIT
// @require      https://code.jquery.com/jquery-3.2.1.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      jira.unicorn.eu
// @match        https://plus4u.net/*
// @run-at       document-idle
// ==/UserScript==

//Test issue - FBLI-7870
const jiraUrl = 'https://jira.unicorn.eu';
const jiraBrowseIssue = jiraUrl + "/browse";
const jiraRestApiUrl = jiraUrl + '/rest/api/2';
const jiraRestApiUrlIssue = jiraRestApiUrl + '/issue';
const jiraIssueKeyPattern = /([A-Z]+-\d+)/;

const $formBody = $("div.info-group > div.info-group-body");

class PageCheck {

    isWorkLogFormPage() {
        //Check that the work log page is loaded by querying for some expected elements
        let artifactTestButton = document.getElementById("sbx113000_tsi_test");
        if (artifactTestButton == null) {
            console.log("Not a worklog page, exiting script.");
            return false;
        }

        if (!$formBody.length) {
            return false;
        }

        let $buttonPanel = $("#standard_form_bar");
        if (!$buttonPanel.length) {
            return false;
        }
        return true;
    }

    isLogTablePage() {
        return document.getElementById('table-tsitems') != null;
    }

}


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
if (pageCheck.isLogTablePage()) {
    console.log("Work log table detected, replacing JIRA issues with links.");
    LogTableDecorator.findAndLinkifyJiraIssues();
    // noinspection JSAnnotator
    return;
}
if (!pageCheck.isWorkLogFormPage()) {
    // noinspection JSAnnotator
    return;
}

class P4U {

    static descArea() {
        return document.getElementsByTagName("textarea")[0];
    }

    static datePicker() {
        return document.getElementsByName("terDate")[0]
            || $("span > input.ues-core-webui-form-dateinput")[0];
    }

    static timeFrom() {
        //Depends on the territory and the create/update work log form mode
        return document.getElementsByName("terTimeFrom")[0]
            || document.getElementById("ues101")
            || document.getElementById("ues103");
    }

    static timeTo() {
        //Depends on the territory and the create/update work log form mode
        return document.getElementsByName("terTimeTo")[0]
            || document.getElementById("TimeTo");
    }

    static dateFrom() {
        return this.parseDateTime(this.datePicker().value, this.timeFrom().value);
    }

    static dateTo() {
        return this.parseDateTime(this.datePicker().value, this.timeTo().value);
    }

    static getDurationSeconds() {
        const dateFrom = P4U.dateFrom();
        const dateTo = P4U.dateTo();
        if (isNaN(dateFrom.getTime()) || isNaN(dateFrom.getTime())) {
            return 0;
        }
        const durationMillis = dateTo - dateFrom;
        return durationMillis > 0 ? durationMillis / 1000 : 0;
    }

    static parseDateTime(selectedDate, selectedTime) {
        const [day, month, year] = selectedDate.split('.');
        const [hour, minute] = selectedTime.split(':');
        return new Date(year, month - 1, day, hour, minute);
    }

    /** Returns the OK button. It is an &lt;a&gt; element containing a structure of spans. */
    static buttonOk() {
        return document.getElementById("form-btn-ok").parentElement;
    }

    /** Returns the 'Next item' button. It is an &lt;a&gt; element containing a structure of spans, or null in case of work log update. */
    static buttonNextItem() {
        const innerSpan = document.getElementById("form-btn-next");
        return (innerSpan) ? innerSpan.parentElement : null;
    }

    /** Returns the 'Next day' button. It is an &lt;a&gt; element containing a structure of spans, or null in case of work log update. */
    static buttonNextDayItem() {
        const innerSpan = document.getElementById("form-btn-next-day");
        return (innerSpan) ? innerSpan.parentElement : null;
    }

    static registerKeyboardShortcuts() {
        P4U.buttonOk().title = "Ctrl + Enter";
        $(document).on("keydown", e => {
            if (e.keyCode === 13 && e.ctrlKey) {
                P4U.buttonOk().click();
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

    static artefactField() {
        return document.getElementById("sbx113000_tsi");
    }

    static roleSelect() {
        let selects = document.getElementsByTagName("select");
        let selectsArray = Array.from(selects, select => select);
        return selectsArray.find(function (select) {
            return select.name.includes("Role");
        });
    }

    static formRowsParent() {
        return document.getElementsByClassName('info-group-body')[0];
    }

    static getRowOfElement(element) {
        while (element.parentElement) {
            element = element.parentElement;
            if (element) {
                if (element.className === "vcFormItemOuterDiv") {
                    return element;
                }
            } else {
                return null;
            }
        }
        return null;
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
     */
    loadIssue(key, onload, onerror) {
        // noinspection JSUnresolvedFunction
        GM_xmlhttpRequest(
            {
                method: 'GET',
                headers: {"Accept": "application/json"},
                url: jiraRestApiUrlIssue.concat("/", key),
                onreadystatechange: function (res) {
                    console.log("Request state changed to: " + res.readyState);
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
        const checked = logWorkEnabled ? `checked="checked"` : "";
        console.log("Adding JIRA Visual into form");
        // noinspection CssUnknownTarget

        const transition = "-webkit-transition: width 0.25s; transition-delay: 0.5s;";
        const trackerStyle = "float: right; width: 55%; border-collapse: collapse; height: 10px; margin-top: 0.2em;";
        $formBody.append
        (`<div class="vcFormItem vcFormItemShow">
            <div class="vcSpanNormalLeftInline">
                <div class="LabelBlock">
                    <label for="jiraLogWorkEnabled">Vykázat na <u>J</u>IRA issue</label>
                    <input type="checkbox" id="jiraLogWorkEnabled" ${checked} accesskey="j" style=" margin-bottom: 3px; vertical-align: bottom; ">
                </div>
                <span style="background: url(../webui/images/infotip.gif) center bottom no-repeat"></span>
            </div>
            <div class="vcSpanNormalRightInline">
                <div>
                    <span id="parsedJiraIssue"></span>
                </div>
            </div>
        </div>
        <div class="vcFormItem vcFormItemShow">
            <div class="vcSpanNormalLeftInline">
                <div class="LabelBlock">
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
                <span style="background: url(../webui/images/infotip.gif) center bottom no-repeat"></span>
            </div>
            <div class="vcSpanNormalRightInline">
                <div>
                    <span id="parsedJiraIssue"></span>
                </div>
            </div>
        </div>
        `);
        const logWorkEnableCheckbox = document.getElementById("jiraLogWorkEnabled");
        logWorkEnableCheckbox.onclick = () => {
            // noinspection JSUnresolvedFunction
            GM_setValue(this._jiraLogWorkEnabledValue, logWorkEnableCheckbox.checked);
            this.trackWork();//To reset the added work log on the tracker
        };
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
            const added = this.isJiraLogWorkEnabled() ? P4U.getDurationSeconds() : 0;
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
        IssueVisual.$jiraIssueSummary().empty().append(`<span>Něco se přihodilo. Asi budete muset vykázat do JIRA ručně.</span>`);
    }

    static $jiraIssueSummary() {
        return $(document.getElementById("parsedJiraIssue"));
    }

    static moveDescArea() {
        let rowOfDescription = P4U.getRowOfElement(P4U.descArea());
        let rowOfSelectRole = P4U.getRowOfElement(P4U.roleSelect());
        P4U.formRowsParent()
            .insertBefore(rowOfDescription, rowOfSelectRole);
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
                    return "USYE.IDCC/CR";
                } else {
                    return "USYE.IDCC/IDCC_MAINSCOPE";
                }
            } else {
                return jiraIssue.projectCode;
            }
        }
        return null;
    }

    static resolveRole(jiraIssue, roles) {
        if (FlowBasedConfiguration.isFlowBasedJira(jiraIssue)) {
            if (FlowBasedConfiguration.isIdccProject(jiraIssue)) {
                return FlowBasedConfiguration.findRoleWitchContains(roles, "IDCC");
            } else {
                return FlowBasedConfiguration.findRoleWitchContains(roles, "FBL1 CGMES");
            }
        }
        return null;
    }

    static findRoleWitchContains(roles, subStringInRole) {
        return roles.find(function (role) {
            return role.text.includes(subStringInRole);
        });
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
        this.issueVisual = new IssueVisual();
        this.jira4U = new Jira4U();
        this._previousDesctiptionValue = P4U.descArea().value;
        this._previousIssue = Jira4U.tryParseIssue(this._previousDesctiptionValue);
    }

    doTheMagic() {
        this.issueVisual.showIssueDefault();
        IssueVisual.moveDescArea();

        console.log("Attaching an onchange listener to the work description input.");
        $(P4U.descArea()).on("propertychange keyup input cut paste", (e) => {
            if (this._previousDesctiptionValue !== e.target.value) {
                this._previousDesctiptionValue = e.target.value;
                this.workDescriptionChanged(e.target.value);
            } else console.log("No description change")
        });

        const updateWorkTracker = () => this.issueVisual.trackWork();
        P4U.timeFrom().onblur = updateWorkTracker;
        P4U.timeTo().onblur = updateWorkTracker;

        //In case of a Work log update, there may already be some work description.
        if (P4U.descArea().value) {
            const wd = Jira4U.tryParseIssue(P4U.descArea().value);
            this.loadJiraIssue(wd);
        }

        //Intercept form's confirmation buttons.
        //The callback function cannot be used directly because the context of 'this' in the callback would be the event target.
        P4U.buttonOk().onclick = () => this.writeWorkLogToJiraIfEnabled();
        if (P4U.buttonNextItem()) P4U.buttonNextItem().onclick = () => this.writeWorkLogToJiraIfEnabled();
        if (P4U.buttonNextDayItem()) P4U.buttonNextDayItem().onclick = () => this.writeWorkLogToJiraIfEnabled();

        P4U.registerKeyboardShortcuts();
        P4U.registerAccessKeys();
    }

    writeWorkLogToJiraIfEnabled() {
        if (this.issueVisual.isJiraLogWorkEnabled()) {
            this.writeWorkLogToJira();
        }
    }

    static fillArtefactIfNeeded(rawJiraIssue) {
        const artefactField = P4U.artefactField();
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

    static selectRole(rawJiraIssue) {
        let jiraIssue = P4uWorklogger.mapToHumanJiraIssue(rawJiraIssue);
        let roles = P4uWorklogger.extractContentFromOptions(P4U.roleSelect());
        let role = FlowBasedConfiguration.resolveRole(jiraIssue, roles);
        if (role) {
            P4U.roleSelect().value = role.value;
        }
    }

    static extractContentFromOptions(selectElement) {
        return Array.from(selectElement.options, option => option);
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
        const wd = Jira4U.tryParseIssue(P4U.descArea().value);
        if (!wd.issueKey) {
            return;
        }
        const durationSeconds = P4U.getDurationSeconds();
        if (durationSeconds <= 0) {
            return 0;
        }
        const dateFrom = P4U.dateFrom();
        console.log(`Logging ${durationSeconds} minutes of work on ${wd.issueKey}`);
        this.jira4U.logWork({
            key: wd.issueKey,
            started: dateFrom,
            duration: durationSeconds,
            comment: wd.descriptionText,
            onSuccess: (res) => {
                console.log("Work was successfully logged to JIRA.", JSON.parse(res.responseText));
            },
            onError: (err) => {
                console.log("Failed to log work to JIRA. ", err);
            },
            onReadyStateChange: function (res) {
                console.log("Log work request state changed to: " + res.readyState);
            }
        });
    }

    /**
     * @param {string} description The new work description value
     */
    workDescriptionChanged(description) {
        const wd = Jira4U.tryParseIssue(description);
        if (this._previousIssue.issueKey !== wd.issueKey) {
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
                    P4uWorklogger.selectRole(rawJiraIssue);
                } else {
                    console.log(`Failed to load issue ${key}. Status: ${response.status}`);
                    this.issueVisual.issueLoadingFailed({key, response});
                }
            }, responseErr => {
                console.log(`Failed to load issue ${key}. Status: ${responseErr.status}`);
                this.issueVisual.issueLoadingFailed({key, response: responseErr});
            });
        } else {
            this.issueVisual.showIssueDefault();
        }
    }

}

new P4uWorklogger().doTheMagic();
