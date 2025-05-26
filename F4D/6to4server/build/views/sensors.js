"use strict";
var Sensor = /** @class */ (function () {
    function Sensor(ipv6, name) {
        this.ipv6 = ipv6;
        this.name = name;
        this.ipv6 = ipv6;
        this.name = name;
    }
    Sensor.prototype.addName = function (name) {
        this.name = name;
    };
    return Sensor;
}());
var SensorsList = /** @class */ (function () {
    function SensorsList() {
        this.sensors = [];
    }
    SensorsList.prototype.addSensor = function (sp) {
        this.sensors.push(sp);
    };
    return SensorsList;
}());
