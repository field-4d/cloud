"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
    var colonIndex = raw.indexOf(":") + 2; // find the index of ":"
    // slice the string from the index of ":" to the end of the string
    var LLA = raw.slice(colonIndex).trim();
    return LLA;
    // return raw.slice(12).trim();
}
exports.getIpv6byPing = getIpv6byPing;
function updateExpId(list, newExpId) {
    return list.map(function (item) {
        return __assign(__assign({}, item), { ExperimentData: __assign(__assign({}, item.ExperimentData), { Exp_id: newExpId }) });
    });
}
exports.updateExpId = updateExpId;
