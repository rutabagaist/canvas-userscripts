// ==UserScript==
// @name         Export Rubric and Criteria
// @namespace    https://github.com/UCBoulder
// @description  Export a Canvas rubric for backup
// @include      https://q.utoronto.ca/courses/*/gradebook/speed_grader?*
// @require      https://code.jquery.com/jquery-3.6.0.js
// @require      https://code.jquery.com/ui/1.13.1/jquery-ui.js
// @grant        none
// @run-at       document-idle
// @version      1.0.0
// ==/UserScript==

/* globals $ */

// wait until the window jQuery is loaded
function defer(method) {
    if (typeof $ !== 'undefined') {
        method();
    }
    else {
        setTimeout(function() { defer(method); }, 100);
    }
}

function waitForElement(selector, callback) {
    if ($(selector).length) {
        callback();
    } else {
        setTimeout(function() {
            waitForElement(selector, callback);
        }, 100);
    }
}

function popUp(text) {
    $("#export_rubric_dialog").html(`<p>${text}</p>`);
    $("#export_rubric_dialog").dialog({ buttons: {} });
}

function popClose() {
    $("#export_rubric_dialog").dialog("close");
}

function getAllPages(url, callback) {
    getRemainingPages(url, [], callback);
}

// Recursively work through paginated JSON list
function getRemainingPages(nextUrl, listSoFar, callback) {
    $.getJSON(nextUrl, function(responseList, textStatus, jqXHR) {
        var nextLink = null;
        $.each(jqXHR.getResponseHeader("link").split(','), function (linkIndex, linkEntry) {
            if (linkEntry.split(';')[1].includes('rel="next"')) {
                nextLink = linkEntry.split(';')[0].slice(1, -1);
            }
        });
        if (nextLink == null) {
            // all pages have been retrieved
            callback(listSoFar.concat(responseList));
        } else {
            getRemainingPages(nextLink, listSoFar.concat(responseList), callback);
        }
    });
}

// escape commas and quotes for CSV formatting
function csvEncode(string) {
    if (string && (string.includes('"') || string.includes(','))) {
        return '"' + string.replace(/"/g, '""') + '"';
    }
    return string;
}

defer(function() {
    'use strict';

    // utility function for downloading a file
    var saveText = (function () {
        var a = document.createElement("a");
        document.body.appendChild(a);
        a.style = "display: none";
        return function (textArray, fileName) {
            var blob = new Blob(textArray, {type: "text"}),
                url = window.URL.createObjectURL(blob);
            a.href = url;
            a.download = fileName;
            a.click();
            window.URL.revokeObjectURL(url);
        };
    }());

    $("body").append($('<div id="export_rubric_dialog" title="Export Rubric"></div>'));
    // Only add the export button if a rubric is appearing
    if ($('#rubric_summary_holder').length > 0) {
        $('#gradebook_header div.statsMetric').append('<button type="button" class="Button" id="export_rubric_crit_btn">Export Rubric Criteria</button>');
        $('#export_rubric_crit_btn').click(function() {
            popUp("Exporting rubric, please wait...");

            // Get some initial data from the current URL
            const courseId = window.location.href.split('/')[4];
            const urlParams = window.location.href.split('?')[1].split('&');
            const assignId = urlParams.find(i => i.split('=')[0] === "assignment_id").split('=')[1];

            // Get the rubric data
            $.getJSON(`/api/v1/courses/${courseId}/assignments/${assignId}`, function(assignment) {
        
                // If rubric is set to hide points, then also hide points in export
                // If rubric is set to use free form comments, then also hide ratings in export
                const hidePoints = assignment.rubric_settings.hide_points;
                const hideRatings = assignment.rubric_settings.free_form_criterion_comments;
                if (hidePoints && hideRatings) {
                    popUp("ERROR: This rubric is configured to use free-form comments instead of ratings AND to hide points, so there is nothing to export!");
                    return;
                }

                // Fill out the csv header and map criterion ids to sort index
                // Also create an object that maps criterion ids to an object mapping rating ids to descriptions
                var critOrder = {};
                var critRatingDescs = {};
                var title = assignment.name;
                var header = "Criterion Name, Criterion Value";
                $.each(assignment.rubric, function(critIndex, criterion) {
                    critOrder[criterion.id] = critIndex;
                    critRatingDescs[criterion.id] = {};
                    $.each(criterion.ratings, function(i, rating) {
                        critRatingDescs[criterion.id][rating.id] = rating.description;
                    });
                    if (!hideRatings) {
                        header += ',' + csvEncode('Rating: ' + criterion.description);
                    }
                    if (!hidePoints) {
                        header += ',' + csvEncode('Points: ' + criterion.description);
                    }
                });
                
                header += '\n';

                
                
                popClose();
                saveText(csvRows, `Rubric Params ${assignment.name.replace(/[^a-zA-Z 0-9]+/g, '')}.csv`);
            });
        });
    }
});
