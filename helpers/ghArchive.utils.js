// Used to ungz
const pako = require('pako');
// Used for easy caching in IndexedDB
const { get, set } = require('idb-keyval');

/* 
    EventTypes doc : https://developer.github.com/v3/activity/events/types/ 
*/
export const eventTypes = {
    push: "PushEvent",
    pullRequest: "PullRequestEvent", 
    watch: "WatchEvent", 
    gollum: "GollumEvent", 
    issues: "IssuesEvent", 
    issueComment: "IssueCommentEvent", 
    fork: "ForkEvent", 
    create: "CreateEvent", 
    delete: "DeleteEvent", 
    release: "ReleaseEvent", 
    pullRequestReviewComment: "PullRequestReviewCommentEvent", 
    member: "MemberEvent", 
    commitComment: "CommitCommentEvent", 
    public: "PublicEvent"
};

export function buildEvents(objects){
    // Using a set to avoid duplicates
    const types = new Set();
    objects.forEach((object) => {
        types.add(object.type);
    })
    return types;
}

/**
 * Retrieve data from GHArchive (using Cors anywhere to avoid cors issues)
 * Uncompress gz with Pako (only lib who can ungz in Browser)
 * return a PROMISE (see usage below)
 *
 * @param {string} date (2015-01-01-15) (year-month-day-hour)
 * @param {HTMLElement} progress 
 * @returns promise who contains parsed data
 */
export async function getFromGHArchive(date, progress) {
    const cached = await get(date);
    if(cached){
        console.log('retrieved from cache');
        return cached;
    }

    return new Promise((resolve, reject) => {
        console.log("Starting download from GHArchive for date", date);
        progress.style.display = 'block';

        const ghArchiveURL = `https://cors-anywhere.herokuapp.com/http://data.gharchive.org/${date}.json.gz`;
        const xhr = new XMLHttpRequest();
        xhr.open('GET', ghArchiveURL, true);
        xhr.responseType = 'arraybuffer';
        xhr.onprogress = (e) => {
            if (e.lengthComputable) {
                progress.max = e.total;
                progress.value = e.loaded;
            }
        }
        const onError = function () {
            progress.style.display = 'none';
            reject();
        };
        xhr.onerror = 
        xhr.onload = (e) => {
            if (xhr.status == 200) {
                const parsed = parseGithubData(xhr);

                return cacheData(date, parsed, progress, resolve)
                                .catch((err) => {debugger; console.log("error while saving in cache", err)});
            } else {
                onError()
                reject();
            }
        };
        
        xhr.send(null);
    });
}

/**
 *
 *
 * @export
 * @param {string} yearMonth 2018-01
 * @param {number} numberOfDays 1-3 (don't be mad)
 * @param {number} numberOfHours 10
 * @param {Element} progress 
 */
export async function getPeriodFromGH(yearMonth, numberOfDays, numberOfHours, progress){
    const days = new Array(numberOfDays);
    const hours = new Array(numberOfHours);

    const fullData = [];
    for(let v = 1; v < days.length+1; v++){
        for(let i = 0; i < hours.length; i++){
            let currentDay = v;
            if(v < 9){
                currentDay = "0"+v;
            }
            const parsed = await getFromGHArchive(yearMonth + `-${currentDay}-${i}`, progress);
            fullData.push(parsed);
        }
    }

    // Flattening into one single big (and fat) array
    return [].concat.apply([], fullData);
}

function cacheData(date, parsed, progress, resolve) {
    return set(date, parsed)
        .then(() => {
            console.log(`Inserted parsed events into IndexedDB for ${date}`);
            progress.style.display = 'none';
            resolve(parsed);
        });
}

function parseGithubData(xhr) {
    const data = pako.inflate(new Uint8Array(xhr.response), { to: 'string' });
    const objects = data.split('\n');
    const parsed = [];
    for (const githubEvent of objects) {
        try {
            const json = JSON.parse(githubEvent);
            parsed.push(json);
        }
        catch (err) {
            // console.log('invalid object', err, githubEvent);
        }
    }
    return parsed;
}

export function filterDataByEvent(data, eventType){
    return data.filter((object) => object.type === eventType);
}