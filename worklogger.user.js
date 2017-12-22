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

    /**
     * Adds jira issue container to the form.
     */
    static addToForm() {
        $formBody.append
        (`<div class="vcFormItem vcFormItemShow">
            <div class="vcSpanNormalLeftInline">
                <div class="LabelBlock"><label>JIRA issue</label></div>
                <span style="background: url(../webui/images/infotip.gif) center bottom no-repeat"></span>
            </div>
            <div class="vcSpanNormalRightInline">
                <div><span id="parsedJiraIssue"></span></div>
            </div>
        </div>
        `);
    }

    /**
     * Display a loaded JIRA issue in the form as a link.
     * @param issue The JIRA issue object as fetched from JIRA rest API
     */
    static showIssue(issue) {
        $("#parsedJiraIssue").empty().append(`<a href="${jiraBrowseIssue}/${issue.key}" target="_blank">${issue.key} - ${issue.fields.summary}</a>`);
    }

    /**
     * The default content to be displayed when no issue has been loaded.
     */
    static showIssueDefault() {
        $("#parsedJiraIssue").empty().append(`<span>Zadejte kód JIRA Issue na začátek Popisu činnosti.</span>`);
    }

    static issueLoadingFailed(responseDetail) {
        let responseErr = responseDetail.response;
        let key = responseDetail.key;
        if (responseErr.status === 401) {
            $("#parsedJiraIssue").empty().append(`JIRA autentifikace selhala. <a href="${jiraUrl}/${key}">Přihlaste se do JIRA.</a>`);
            return;
        }
        if (responseErr.status === 404
            && responseErr.responseHeaders
            && responseErr.responseHeaders.match(/content-type:\sapplication\/json/) != null) {
            let error = JSON.parse(responseErr.responseText);
            if (error.errorMessages) {
                $("#parsedJiraIssue").empty().append(`<span>Nepodařilo se načíst issue ${key}: ${error.errorMessages.join(", ")}.</span>`);
                return;
            }
        }
        $("#parsedJiraIssue").empty().append(`<span>Něco se přihodilo. Asi budete muset vykázat do JIRA ručně.</span>`);
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
IssueVisual.addToForm();
IssueVisual.showIssueDefault();
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
                IssueVisual.showIssue(JSON.parse(response.responseText));
            } else {
                console.log(`Failed to load issue ${key}. Status: ${response.status}`);
                IssueVisual.issueLoadingFailed({key, response});
            }
        }, responseErr => {
            console.log(`Failed to load issue ${key}. Status: ${responseErr.status}`);
            IssueVisual.issueLoadingFailed({key, response: responseErr});
        });
    } else {
        IssueVisual.showIssueDefault();
    }
}