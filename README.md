# Plus4U++ aka p4u-worklogger
The browser user script which enhances the Plus4U work log page.

***

## Features
- Loads and displays summary of a a JIRA issue, whose key is mentioned in the work description, as a link.
- Writes a work log record directly into JIRA the moment it is created at the Plus4U work log page.
- Adds mnemonics to the form buttons. (See access keys usage in your OS/browser.)

## In the future
Thanks to JIRA REST API flexibility, the user script may integrate JIRA issue tracker into the Plus4U work log page much more tightly.
Feel free to suggest new features at [GitHub Issues page](https://github.com/bubblefoil/p4u-worklogger/issues).
Eventually this script may come packed as a standalone browser extension.

***

## Installation
* Install ([Tampermonkey](https://tampermonkey.net/)), the user script manager
 extension into your browser. The ([Greasemonkey](https://www.greasespot.net/) is not supported. 
* Check the manual of the script manager for further instructions

***

### Changelog
- **1.0.8**
    - Role and artifact are filled in based on Jira issue attributes. Mapping rules are hardcoded for FBCE projects.
- **1.0.5**
    - Fixed Jira issues detection in the work log table in multi-line descriptions.
- **1.0.4**
    - Jira issue is not reloaded unless the work description is actually changed.
- **1.0.3**
    - Jira issues are detected in the work log table and replaced with links.
- **1.0.2**
    - Added Ctrl-Enter shortcut to OK button.
    - Added mnemonics to Next item/day buttons.
- **1.0.1**
    - Persistent checkbox state.