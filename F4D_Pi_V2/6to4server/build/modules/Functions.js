"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateExpId = exports.getIpv6byPing = exports.isPing = exports.checkPkg = void 0;
function checkPkg(raw) {
    if (raw.trim().startsWith('{') && raw.trim().endsWith('}')) {
        console.log('The package is valid');
        return true;
    }
    else {
        return false;
    }
}
exports.checkPkg = checkPkg;
function isPing(str) {
    str = str.trim();
    if (str.includes('PING')) {
        return true;
    }
    else {
        return false;
    }
}
exports.isPing = isPing;
function getIpv6byPing(raw) {
    const colonIndex = raw.indexOf(":") + 2; // find the index of ":"
    // slice the string from the index of ":" to the end of the string
    const LLA = raw.slice(colonIndex).trim();
    return LLA;
    // return raw.slice(12).trim();
}
exports.getIpv6byPing = getIpv6byPing;
function updateExpId(list, newExpId) {
    return list.map(item => {
        return {
            ...item,
            ExperimentData: {
                ...item.ExperimentData,
                Exp_id: newExpId
            }
        };
    });
}
exports.updateExpId = updateExpId;
