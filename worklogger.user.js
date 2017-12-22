// ==UserScript==
// @name         p4u-worklogger
// @description  JIRA work log in UU
// @version      0.0.1
// @namespace    https://plus4u.net/
// @author       bubblefoil
// @license      MIT
// @require      https://code.jquery.com/jquery-3.2.1.min.js
// @grant        GM_xmlhttpRequest
// @connect      jira.unicorn.eu
// @match        https://plus4u.net/*
// @run-at       document-end
// ==/UserScript==

//Test issue - FBLI-7870
const jiraUrl = 'https://jira.unicorn.eu';
const jiraBrowseIssue = jiraUrl + "/browse";
const jiraRestApiUrl = jiraUrl + '/rest/api/2';
const jiraRestApiUrlIssue = jiraRestApiUrl + '/issue';
const jiraIssueKeyPattern = /([A-Z]+-\d+)/;

//Check that the worklog page is loaded by querying for some expected elements
const $descArea = $("textarea#terShortData");
if (!$descArea.length) {
	console.log("Not a worklog page, exiting script.");
	// noinspection JSAnnotator
	return;
}
const $formBody = $("div.info-group > div.info-group-body");
if (!$formBody.length) {
	// noinspection JSAnnotator
	return;
}

class P4U {

    /** Returns the OK button. It is an &lt;a&gt; element containing a structure of spans. */
    static buttonOk() {
        //TODO initialize this after the buttons are present. Use MutationObserver to detect the changes.
        // return this._buttonOk;
        return $("#form-btn-ok_label").parentElement.parentElement;
    }

}
/**
 * JIRA API connector.
 */
class Jira4U {

    constructor() {
    }

    /**
     * @param {string} key JIRA issue key string
     * @param {Function} onload
     * @param {Function} onerror
     */
    loadIssue(key, onload, onerror) {

        // noinspection JSUnusedGlobalSymbols
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
}

/**
 * JIRA issue visualisation functions.
 */
class IssueVisual {

    constructor() {
        if ($("#parsedJiraIssue").length === 0) {
            this.addToForm();
        }
        this._$jiraIssueSummary = $("#parsedJiraIssue");
    }

    /**
     * Adds jira issue container to the form.
     */
    addToForm() {
        console.log("Adding JIRA Visual into form");
        $formBody.append
        (`<div class="vcFormItem vcFormItemShow">
            <div class="vcSpanNormalLeftInline">
                <div class="LabelBlock">
                    <label for="jiraLogWorkEnabled">Vykázat na <u>J</u>IRA issue</label>
                    <input type="checkbox" id="jiraLogWorkEnabled" checked="checked" accesskey="j" style=" margin-bottom: 3px; vertical-align: bottom; ">
                </div>
                <span style="background: url(../webui/images/infotip.gif) center bottom no-repeat"></span>
            </div>
            <div class="vcSpanNormalRightInline">
                <div><span id="parsedJiraIssue"></span></div>
            </div>
        </div>
        `);
        this._$jiraIssueSummary = $("#parsedJiraIssue");
    }

    /**
     * Display a loaded JIRA issue in the form as a link.
     * @param issue The JIRA issue object as fetched from JIRA rest API
     */
    showIssue(issue) {
        this._$jiraIssueSummary.empty().append(`<a href="${jiraBrowseIssue}/${issue.key}" target="_blank">${issue.key} - ${issue.fields.summary}</a>`);
    }

    /**
     * The default content to be displayed when no issue has been loaded.
     */
    showIssueDefault() {
        this._$jiraIssueSummary.empty().append(`<span>Zadejte kód JIRA Issue na začátek Popisu činnosti.</span>`);
    }

    issueLoadingFailed(responseDetail) {
        let responseErr = responseDetail.response;
        let key = responseDetail.key;
        if (responseErr.status === 401) {
            this._$jiraIssueSummary.empty().append(`JIRA autentifikace selhala. <a href="${jiraUrl}/${key}">Přihlaste se do JIRA.</a>`);
            return;
        }
        if (responseErr.status === 404
            && responseErr.responseHeaders
            && responseErr.responseHeaders.match(/content-type:\sapplication\/json/) != null) {
            let error = JSON.parse(responseErr.responseText);
            if (error.errorMessages) {
                this._$jiraIssueSummary.empty().append(`<span>Nepodařilo se načíst issue ${key}: ${error.errorMessages.join(", ")}.</span>`);
                return;
            }
        }
        this._$jiraIssueSummary.empty().append(`<span>Něco se přihodilo. Asi budete muset vykázat do JIRA ručně.</span>`);
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

    set issueKey(value) {
        this._issueKey = value;
    }

    get descriptionText() {
        return this._descriptionText;
    }

    set descriptionText(value) {
        this._descriptionText = value;
    }
}

// Initialize the page decoration.
// const p4U = new P4U();
// p4U.buttonOk($("#form-btn-ok_label").parentElement.parentElement);
const issueVisual = new IssueVisual();
issueVisual.showIssueDefault();
const jira4U = new Jira4U();

console.log("Attaching an onchange listener to the work description input.");
$descArea.on("propertychange keyup input cut paste", (e) => {
    console.log(e);
    workDescriptionChanged(e);
});

function workDescriptionChanged(e) {
    tryParseIssue(e.target.value);
}

function tryParseIssue(desc) {
    console.log(`Parsing description: ${desc}`);
    if (typeof desc !== "string") {
        return;
    }
    let wd = WorkDescription.parse(desc);
    if (wd.issueKey) {
        let key = wd.issueKey;
        console.log("JIRA issue key recognized: ", key);
        jira4U.loadIssue(wd.issueKey, response => {
            console.log(`Loading of issue ${key} completed.`);
            //Getting into the onload function does not actually mean the status was OK
            if (response.status === 200) {
                console.log(`Issue ${key} loaded successfully.`);
                issueVisual.showIssue(JSON.parse(response.responseText));
            } else {
                console.log(`Failed to load issue ${key}. Status: ${response.status}`);
                issueVisual.issueLoadingFailed({key, response});
            }
        }, responseErr => {
            console.log(`Failed to load issue ${key}. Status: ${responseErr.status}`);
            issueVisual.issueLoadingFailed({key, response: responseErr});
        });
    } else {
        issueVisual.showIssueDefault();
    }
}