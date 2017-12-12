// ==UserScript==
// @name         UU-WorkLogger
// @namespace    https://plus4u.net/
// @version      0.0.1
// @description  Jira work log in UU
// @author       AHoj
// @require      https://code.jquery.com/jquery-3.2.1.min.js
// @grant        GM_xmlhttpRequest
// @connect      https://jira.unicorn.eu/rest
// @match        https://plus4u.net/*
// ==/UserScript==

//Test issue - FBLI-7870
const jiraRestApiUrl = 'https://jira.unicorn.eu/rest/api/2/';
const jiraRestApiUrlIssue = jiraRestApiUrl + 'issue/';
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

//Add jira issue container
$formBody.append(
	"<div class=\"vcFormItem vcFormItemShow\">\n" +
	"    <div class=\"vcSpanNormalLeftInline\">\n" +
	"        <div class=\"LabelBlock\"><label>Issue</label></div>\n" +
	"        <div class=\"ImageBlock\"><img class=\"vcImageFormNoItemHelp\"\n" +
	"                                     src=\"https://cdn-legacy.plus4u.net/uu-os8-ui/gui_257/ie_5.5/ues/images/other/form_nothing.gif\" alt=\"\"></div>\n" +
	"    </div>\n" +
	"    <div class=\"vcSpanNormalRightInline\">\n" +
	"        <div class=\"vcInput\"><span id=\"parsedJiraIssue\" class=\"vcInput\"></div>\n" +
	"    </div>\n" +
	"</div>"
);

/**
 * Container for a Jira issue key + description. It can construct itself by parsing the issue key from work description.
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

function displayIssue(issue) {
	console.log(issue.key, issue.fields.summary);
	$("#parsedJiraIssue").val(`${issue.key} - ${issue.fields.summary}`);
}

function loadIssue(key) {
	//todo

	GM_xmlhttpRequest(
		{
			method: 'GET',
			headers: {"Accept": "application/json"},
			url: jiraRestApiUrlIssue + key,
			onreadystatechange: function (res) {
				console.log("Request state changed to: " + res.readyState);
			},
			onload: function (responseDetails) {
				console.log(`Issue ${key} loaded.`);
				displayIssue(JSON.parse(responseDetails.responseText));
			}
		}
	);
}

function tryParseIssue(desc) {
	console.log(`Parsing description: ${desc}`);
	if (typeof desc !== "string") {
		return;
	}
	let wd = WorkDescription.parse(desc);
	if (wd.issueKey) {
		console.log("Jira issue key recognized: ", wd.issueKey);
		loadIssue(wd.issueKey);
	}
}

function workDescriptionChanged(e) {
	tryParseIssue(e.target.value);
}

//TODO register this only when the textArea receives focus so it may be also updated by selecting a issue from a dropdown
console.log("Attaching an onchange listener to the work description input.");
$descArea.change(function (e) {
	console.log(e);
	workDescriptionChanged(e);
});