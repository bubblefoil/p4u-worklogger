# Plus4U++ aka p4u-worklogger
The browser user script which enhances the Working Time Management.

***

## Features
- Loads and displays summary of a a JIRA issue. Type the issue key in the work description. Following text will be the JIRA work log comment.
- Writes the same work log record to JIRA as filled in Working Time Management form.
- Adds some keyboard shortcuts & mnemonics. (See access keys usage in your OS/browser.)
- Pre-fills Subject and Category with previously filled values for chosen JIRA project.
- Calculates sum of working hours for a custom range of days within selected month.
- See [wiki page](https://github.com/bubblefoil/p4u-worklogger/wiki/Features)

***

## Installation
- Install [Tampermonkey](https://tampermonkey.net), the user script manager
 extension into your browser. [Greasemonkey](https://www.greasespot.net) is not supported. 
- Either:
  - Open this link to install plugin: [worklogger.user.js](https://github.com/bubblefoil/p4u-worklogger/raw/master/worklogger.user.js)
    - Script should be recognized and displayed in Tampermonkey. There is an Install button.
  - Go to the script page at [greasyfork.org](https://greasyfork.org/en/scripts/36386-p4u-worklogger) or [openuserjs.org](https://openuserjs.org/scripts/bubblefoil/p4u-worklogger)
    - There should be a button to install/update p4u-worklogger

***

## Future work
Thanks to JIRA REST API flexibility, the user script may integrate JIRA issue tracker into Working Time Management much more tightly.
Feel free to suggest new features at [GitHub Issues page](https://github.com/bubblefoil/p4u-worklogger/issues).

Eventually, this script may come packed as a standalone browser extension.
