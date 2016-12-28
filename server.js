/**
* Copyright © 2016, ACM@UIUC
*
* This file is part of the Groot Project.  
* 
* The Groot Project is open source software, released under the University of
* Illinois/NCSA Open Source License. You should have received a copy of
* this license in a file with the distribution.
**/

// Requires
var path = require("path");
require('dotenv').config({path: path.resolve(__dirname) + '/.env'});
var express = require('express');
var fileUpload = require('express-fileupload'); // ADDED
var app = express();
var bodyParser = require('body-parser');
var session = require('client-sessions'); // ADDED
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
var request = require('request');


const PORT = process.env.PORT || 5000;
const SERVICES_URL = process.env.SERVICES_URL || 'http://localhost:8000';
const GROOT_ACCESS_TOKEN = process.env.GROOT_ACCESS_TOKEN || "TEMP_STRING";
const GROOT_RECRUITER_TOKEN = process.env.GROOT_RECRUITER_TOKEN || "TEMP_STRING";

app.set('views', path.resolve(__dirname) + '/views');
app.set('view engine', 'ejs');
// npm install client-sessions
app.use(session({
	cookieName: 'session',
	secret: process.env.SESSION_TOKEN,//used for hashing
	duration: 30*60*1000,
	activeDuration: 5*60*1000,
	httpOnly: true, // prevents browers JS from accessing cookies
	secure: true, // cookie can only be used over HTTPS
	ephemeral: true // Deletes cookie when browser closes.
}));

// Handle Sessions Accross different pages using express

app.use(function(req, res, next){//mainly for the inital load, setting initial values for the session
	if(!req.session.netid)
	{
		req.session.auth = false;
		req.session.isAdmin = false;
	}
	next();
});

/*
	Listing of session variables:
		session.auth: if a user is authenticated
		session.isAdmin: if a user is an Admin/elevated privs
		session.isCorporate: if a user is a Corporate member
		session.netid
		session.token
*/


//TODO Add more POST endpoints for all our form interactions

app.post('/login', function(req, res){
	var netid = req.body.netid, pass = req.body.password;
	var options = {
		url: `${SERVICES_URL}/session?username=${netid}`,
		method:"POST",
		json: true,
		headers: {
			"Authorization": GROOT_ACCESS_TOKEN
		},
		body: {
			"username" : netid,
			"password" : pass,
			"validation-factors" : {
				"validationFactors" : [{
					"name" : "remote_address",
					"value" : "127.0.0.1"
				}]
			}
		}
	};

	function callback(error, response, body)
	{
		if(!body || !body["token"])
		{
			res.render('login', {
				authenticated: false,
				error: 'Invalid email or password.'
			});
		}
		else
		{
			if(error)
				console.log("Error: " + error);
			if(body["reason"])
				console.log("ISSUE: " + body["reason"]);
			console.log(body);
			req.session.netid = netid;
			req.session.token = body["token"];
			req.session.auth = true;
			console.log("token: " + body["token"]);
			console.log("session:" + req.session);

			res.redirect('intranet');
		}
	}
	request(options, callback);
});

function checkIfAdmin(req, res, nextSteps)
{
	var netid = req.session.netid;
	if (!netid) {
		nextSteps(req, res);
		return;
	}

	var options = {
		url: `${SERVICES_URL}/groups/committees/admin?isMember=${netid}`,
		headers: {
			"Authorization": GROOT_ACCESS_TOKEN
		},
		method:"GET"
	};

	function callback(error, response, body) {
		if(body) {
			req.session.isAdmin = JSON.parse(body).isValid;
			nextSteps(req, res);
        }
	}

	request(options, callback);
}

function checkIfCorporate(req, res, nextSteps)
{
	var netid = req.session.netid;
	if (netid == undefined) {
		checkIfAdmin(req, res, nextSteps);
		return;
	}

    var options = {
        url: `${SERVICES_URL}/groups/committees/corporate?isMember=${netid}`,
        headers: {
            "Authorization": GROOT_ACCESS_TOKEN
        },
        method:"GET"
    };

    function callback(error, response, body) {
		if (!body){
			res.status(500).send("Error verifying corporate status.");
		} else {
			req.session.isCorporate = JSON.parse(body).isValid;
			checkIfAdmin(req, res, nextSteps);
		}
    }

	request(options, callback);
}

function checkIfTop4(req, res, nextSteps)
{
	var netid = req.session.netid;
	if (!netid) {
		res.redirect('/login');
	}

	var options = {
		url: `${SERVICES_URL}/groups/committees/Top4?isMember=${netid}`,
		headers: {
			"Authorization": GROOT_ACCESS_TOKEN
		},
		method:"GET"
	};

	function callback(error, response, body)
	{
		// if(error || !body)
			// console.log("Error: " + error);
		if(body && JSON.parse(body).isValid)
		{
			req.session.isAdmin = JSON.parse(body).isValid;
		}		
		nextSteps(req, res);

	}
	request(options, callback);
}

// reset session when user logs out
app.get('/logout', function(req, res) {
  req.session.reset();
  res.redirect('/');
});

/*********************************************************************/

var sponsorsScope = {
	job: {
		jobType: null,
		types: [{
			name: 'Internship'
		}, {
			name: 'Co-Op'
		}, {
			name: 'Full Time'
		}],
	},
	degree: {
		degreeType: null,
		types: [{
			name: 'Bachelors'
		}, {
			name: 'Masters'
		}, {
			name: 'Ph.D'
		}],
	},
	grad: {
		gradYear: null,
		years: [],
	},
	student: {
		firstName: null,
		lastName: null,
		netid: null,
		email: null,
		gradYear: null,
		degreeType: null,
		jobType: null,
		resume: null,
	}
};

var d = new Date();
var y = d.getFullYear();
var m = d.getMonth();
var dec = "December ";
var may = "May ";

if (m > 6) {
	for (var i = 0; i < 4; i++) {
		sponsorsScope.grad.years.push({
			date: dec + y
		});
		sponsorsScope.grad.years.push({
			date: may + y
		});
		y++;
	}
} else {
	for (var i = 0; i < 4; i++) {
		sponsorsScope.grad.years.push({
			date: may + y
		});
		sponsorsScope.grad.years.push({
			date: dec + y
		});
		y++;
	}
}

app.get('/', function(req, res) {
	res.render('home', {
		authenticated: req.session.auth,
	});
});

app.get('/login', function(req, res) {
	if (req.session.auth) {
		res.redirect('intranet');
	} else {
		res.render('login', {
			authenticated: req.session.auth,
		});
	}
});

app.get('/about', function(req, res) {
    var groupsData = request({
        url: `${SERVICES_URL}/groups/committees`,
        headers: {
			"Authorization": GROOT_ACCESS_TOKEN
		},
        method: "GET"
    }, function(err, response, body) {
        if (err) {
            // Sends the 404 page
            res.status(404).send("Error:\nThis page will be implemented soon!");
        }
        res.render('about', {
            authenticated: req.session.auth,
            committees: JSON.parse(body),
        });
    });
});

app.get('/conference', function(req, res) {
	res.render('conference', {
		authenticated: req.session.auth,
		editions: [
			{ year: '2016', path: '/conference/2016' },
			{ year: '2015', path: '/conference/2015' },
			{ year: '2014', path: '/conference/2014' },
			{ year: '2013', path: '/conference/2013' },
			{ year: '2012', path: '/conference/2012' },
			{ year: '2011', path: '/conference/2011' },
			{ year: '2010', path: '/conference/2010' },
			{ year: '2009', path: '/conference/2009' },
			{ year: '2008', path: '/conference/2008' },
			{ year: '2007', path: '/conference/2007' },
			{ year: '2006', path: '/conference/2006' },
			{ year: '2005', path: '/conference/2005' },
			{ year: '2004', path: '/conference/2004' },
			{ year: '2003', path: '/conference/2003' },
			{ year: '2002', path: '/conference/2002' },
			{ year: '2001', path: '/conference/2001' },
			{ year: '2000', path: '/conference/2000' },
			{ year: '1999', path: '/conference/1999' },
			{ year: '1998', path: '/conference/1998' },
			{ year: '1997', path: '/conference/1997' },
			{ year: '1996', path: '/conference/1996' },
			{ year: '1995', path: '/conference/1995' },
		]
	})
});

app.get('/events', function(req, res) {
	res.render('events', {
		authenticated: req.session.auth,
	});
});

app.get('/intranet', function(req, res) {
	// Inherently checks corporate or admin (and gets redirected after recruiter login)
	if (req.session.isRecruiter) { // TODO figure out why auth gets set to false on a redirect
		req.session.auth = true;
	}

	checkIfCorporate(req, res, function() {
		if(req.session.auth) {
			res.render('intranet', {
				authenticated: req.session.auth,
				session: req.session
			});
		}
		else {
			res.redirect('login');
		}
	});
});

app.post('/join', function(req, res) {
    // creates JSON object of the inputted data
    // sends data to groups-user-service
    var userData = {
        first_name: req.body.first_name,
        last_name: req.body.last_name,
        netid: req.body.netid,
        uin: req.body.uin
    };
    request({
        url: `${SERVICES_URL}/newUser`,
        method: "POST",
        headers: {
			"Authorization": GROOT_ACCESS_TOKEN
		},
        body: userData,
        json: true
    }, function(err, response, body) {
        if(err) {
            console.log(err);
            res.status(520).send("Error: Please go yell at ACM to fix their shit!");
            return;
        }
        console.log("Successfully added new preUser: " + req.body.first_name + " " + req.body.last_name);
        res.redirect('/');
    });
});

app.get('/join', function(req, res) {
    // Going to grab SIG data from the micro-service
    request({
        /* URL to grab SIG data from groot-groups-service */
        url: `${SERVICES_URL}/groups/sigs`,
        headers: {
			"Authorization": GROOT_ACCESS_TOKEN
		},
        method: "GET",
    }, function(err, response, body) {
        if (err) {
            console.log(err);
            res.status(500).send("Error " + err);
            return;
        }
        res.render('join', {
            authenticated: false,
            sigs: JSON.parse(body)
        });
    });
});

app.get('/sigs', function(req, res) {
    request({
        /* URL to grab SIG data from groot-groups-service */
        url: `${SERVICES_URL}/groups/sigs`,
        headers: {
			"Authorization": GROOT_ACCESS_TOKEN
		},
        method: "GET",
    }, function(err, response, body) {
        if (err) {
            console.log(err);
            res.status(500).send("Error " + err);
            return;
        }
        sigs = JSON.parse(body);
        sigs_a = sigs.slice(0, sigs.length / 2);
        sigs_b = sigs.slice(sigs.length / 2 + 1, sigs.length - 1);
        res.render('sigs', {
            authenticated: req.session.auth,
            sig_col_a: sigs_a,
            sig_col_b: sigs_b,
        });
    });
});

app.get('/quotes', function(req, res) {
    request.get({
        url: `${SERVICES_URL}/quotes`,
        headers: {
			"Authorization": GROOT_ACCESS_TOKEN
		},
		method: "GET",
    }, function(error, response, body) {
        if (error) {
            // TODO: ender error page
            // alert("status");
            res.status(500).send("Error " + error.code);
        } else {
            res.render('quotes', {
                authenticated: req.session.auth,
                quotes: body
            });
        }
    });
});

app.get('/sponsors/new_job_post', function(req, res) {
	res.render('new_job_post', {
		authenticated:  req.session.auth,
	});
});

app.post('/sponsors/new_job_post', function(req, res) {
    request({
        url: `${SERVICES_URL}/jobs`,
        method: "POST",
        headers: {
            "Authorization": GROOT_RECRUITER_TOKEN
        },
        json: true,
        body: req.body
    }, function(err, response, body) {
        if (response.statusCode == 200) {
            res.render('home', {
                authenticated: req.session.auth,
            });
        } else {
            res.status(500).send("Error " + body.Text);
            return;
        }
    });
});

app.get('/sponsors/corporate_manager', function(req, res) {
    checkIfCorporate(req, res, function() {
		if (!req.session.isCorporate) {
			res.redirect('/login');
		}

		request({
			url: `${SERVICES_URL}/jobs`,
			method: "GET",
			json: true,
			headers: {
            	"Authorization": GROOT_ACCESS_TOKEN
        	},
			body: {
				graduationStart: req.params.graduationStart,
				graduationEnd: req.params.gradYearEnd,
				netid: req.params.netid,
				level: req.params.level,
				seeking: req.params.jobType,
				approved_resumes: req.params.approved_resumes
			}
		}, function(error, response, body) {
			if (response && response.statusCode != 200) {
				console.log(body);
				res.status(500).send("Error: " + response.statusMessage);
			} else {
				var render_opts = {
				    job: sponsorsScope.job,
				    degree: sponsorsScope.degree,
				    grad: sponsorsScope.grad,
				    student: sponsorsScope.student,
					resumes: JSON.parse(body)
				};
				res.render('corporate_manager', render_opts);
			}
		});
	});
});

app.get('/sponsors/recruiter_login', function(req, res) {
	if (req.session.isRecruiter && req.session.recruiterID !== undefined) {
		req.session.auth = true;
	}

	if(req.session.auth) {
		res.redirect('/intranet');
	} else {
		res.render('recruiter_login', {
        	authenticated:  req.session.auth,
    	});
	}
});

app.post('/sponsors/recruiter_login', function(req, res) {
    request({
		url: `${SERVICES_URL}/recruiters/login`,
		method: "POST",
		headers: {
            "Authorization": GROOT_RECRUITER_TOKEN
        },
        json: true,
		body: req.body
	}, function(err, response, body) {
		if (response && response.statusCode == 200) {
			req.session.auth = true;
			req.session.isRecruiter = true;
			req.session.recruiterID = body.data.id;

			res.redirect('/intranet');
		} else {
			res.render('recruiter_login', {
				authenticated: false,
				error: body.error
			});
		}
	});
});

app.get('/sponsors/resume_book', function(req, res) {
    res.render('resume_book', {
        authenticated:  req.session.auth,
        job: sponsorsScope.job,
        degree: sponsorsScope.degree,
        grad: sponsorsScope.grad,
        student: sponsorsScope.student
    });
});

app.post('/sponsors/resume_book', function(req, res) {
    request({
        url: `${SERVICES_URL}/students`,
        method: "POST",
        headers: {
            "Authorization": GROOT_RECRUITER_TOKEN
        },
        json: true,
        body: req.body
    }, function(err, response, body) {
        if (response.statusCode == 200) {
            res.render('home', {
                authenticated: req.session.auth,
            });
        } else {
            res.status(500).send("Error " + body.error);
            return;
        }
    });
});

app.get('/sponsors/resume_filter', function(req, res) {
	res.render('resume_filter', {
		authenticated:  req.session.auth,
		job: sponsorsScope.job,
		degree: sponsorsScope.degree,
		grad: sponsorsScope.grad,
		student: sponsorsScope.student,
	})
});


app.get('/sponsors', function(req, res) {
	res.render('sponsors', {
		authenticated:  req.session.auth,
	});
});

app.get('/sponsors/sponsors_list', function(req, res) {
	res.render('sponsor_list', {
		authenticated:  req.session.auth,
	});
});


app.use(express.static(__dirname + '/public'));
app.use('/sponsors', express.static(__dirname + '/public'));

// //Start server and logs port as a callback
app.listen(PORT, function() {
	console.log('GROOT_DESKTOP is live on port ' + PORT + "!");
});
