const http = require('http');
const os = require('os');
const dns = require('dns');

const serviceName = "kubia.default.svc.cluster.local";
const port = 8080;



var handler = function (request, response) {
    dns.resolveSrv(serviceName, function (err, addresses) {
        if (err) {
            console.log("Could not look up DNS SRV records: " + err);
            return;
        }
        if (addresses.length == 0) {
            console.log("No peers discovered.");
        } else {
            addresses.forEach(function (item) {
                console.log("IP address: " + item.name);
            });
        }
    });
    response.writeHead(200);
    response.end("Success");
};

var www = http.createServer(handler);
www.listen(port);