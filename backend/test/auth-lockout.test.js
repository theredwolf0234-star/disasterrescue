/**
 * Comprehensive Test Suite for AISTER Admin Authentication, Rate Limiting & Account Lockout
 * Tests all core requirements:
 * 1. Legitimate admin login success & counter reset
 * 2. Unrelated requests & session checks (GET /api/auth/me, /health) do not increment failed attempts
 * 3. Genuine failed authentication attempts increment counter
 * 4. 5 consecutive failed attempts trigger account lockout (HTTP 423) with remainingMinutes
 * 5. Admin isolation: Locking out Admin A does not lock out Officer B from the same IP
 * 6. Rate limiter uses client IP with proxy-awareness without blocking all users
 * 7. Authorized admin recovery and unlocking via secure single-use recovery token
 * 8. Lockout expiry logic verifies timestamp-based release
 */

const assert = require('assert');
const http = require('http');
const bcrypt = require('bcryptjs');
const { app } = require('../src/server');
const db = require('../src/config/database');

let testServer;
const testPort = 5059;
const baseUrl = `http://127.0.0.1:${testPort}`;

function makeRequest(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, baseUrl);
        const serializedBody = body ? (typeof body === 'object' ? JSON.stringify(body) : body) : null;
        const reqHeaders = {
            'Content-Type': 'application/json',
            ...headers
        };
        if (serializedBody) {
            reqHeaders['Content-Length'] = Buffer.byteLength(serializedBody);
        }

        const options = {
            method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: reqHeaders
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, body: parsed, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data, headers: res.headers });
                }
            });
        });

        req.on('error', reject);

        if (serializedBody) {
            req.write(serializedBody);
        }
        req.end();
    });
}

async function runTests() {
    console.log('================================================================');
    console.log(' AISTER ADMIN AUTHENTICATION, RATE LIMITING & LOCKOUT TEST SUITE');
    console.log('================================================================\n');

    let passed = 0;
    let failed = 0;

    async function test(name, fn) {
        try {
            await fn();
            console.log(`  [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  [FAIL] ${name}`);
            console.error(`         ${err.message}`);
            failed++;
        }
    }

    // Start test server
    await db.initDatabase();
    await new Promise((resolve) => {
        testServer = app.listen(testPort, resolve);
    });

    try {
        // Ensure Admin A (AISTER23) is reset and unlocked
        const testHash = await bcrypt.hash('@aster23', 10);
        await db.run(
            `UPDATE authority_users 
             SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL 
             WHERE username = 'AISTER23'`
            , [testHash]
        );

        // Ensure Officer B (ndrf_commander) is reset and unlocked
        const officerHash = await bcrypt.hash('authority123', 10);
        await db.run(
            `UPDATE authority_users 
             SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL 
             WHERE username = 'ndrf_commander'`,
            [officerHash]
        );

        // Clear any rate-limit records for test IP
        await db.run(`DELETE FROM rate_limit_records WHERE key LIKE '%127.0.0.1%' OR key LIKE '%198.51.%' OR key LIKE '%203.0.%'`);

        // TEST 1: Legitimate Admin Login Success
        await test('1. Legitimate admin credentials return HTTP 200 with JWT token and role', async () => {
            const res = await makeRequest('POST', '/api/auth/authority-login', {
                identifier: 'AISTER23',
                password: '@aster23'
            }, { 'x-forwarded-for': '198.51.100.1' });

            assert.strictEqual(res.status, 200, `Expected HTTP 200, got ${res.status}: ${JSON.stringify(res.body)}`);
            assert.strictEqual(res.body.success, true);
            assert.ok(res.body.token, 'Should return a valid JWT token');
            assert.strictEqual(res.body.user.role, 'ADMIN');

            // Verify failed attempts in DB is 0
            const check = await db.get('SELECT failed_login_attempts, locked_until FROM authority_users WHERE username = ?', ['AISTER23']);
            assert.strictEqual(check.failed_login_attempts, 0);
            assert.strictEqual(check.locked_until, null);
        });

        // TEST 2: Page refreshes and session checks do NOT count against failed-login counters
        await test('2. Repeated GET /api/auth/me checks do not increment failed attempts or cause lockout', async () => {
            for (let i = 0; i < 10; i++) {
                const res = await makeRequest('GET', '/api/auth/me', null, {
                    'x-forwarded-for': '198.51.100.1'
                });
                assert.strictEqual(res.status, 401, 'Unauthenticated /me returns 401');
            }

            const check = await db.get('SELECT failed_login_attempts FROM authority_users WHERE username = ?', ['AISTER23']);
            assert.strictEqual(check.failed_login_attempts, 0, 'Failed attempts must remain 0 after /me requests');
        });

        // TEST 3: Health check endpoint bypasses rate limiting
        await test('3. Health check GET /api/health bypasses rate limiting completely', async () => {
            for (let i = 0; i < 5; i++) {
                const res = await makeRequest('GET', '/api/health', null, { 'x-forwarded-for': '198.51.100.2' });
                assert.strictEqual(res.status, 200);
                assert.strictEqual(res.body.status, 'ok');
            }
        });

        // TEST 4: Failed password attempt increments counter and returns attempts remaining
        await test('4. Genuine wrong password increments failed attempts counter (attempts 1 to 4)', async () => {
            // First wrong password
            const res1 = await makeRequest('POST', '/api/auth/authority-login', {
                identifier: 'AISTER23',
                password: 'WrongPassword1'
            }, { 'x-forwarded-for': '198.51.100.3' });

            assert.strictEqual(res1.status, 401);
            assert.strictEqual(res1.body.failedAttempts, 1);
            assert.strictEqual(res1.body.attemptsRemaining, 4);

            // Second wrong password
            const res2 = await makeRequest('POST', '/api/auth/authority-login', {
                identifier: 'AISTER23',
                password: 'WrongPassword2'
            }, { 'x-forwarded-for': '198.51.100.3' });

            assert.strictEqual(res2.status, 401);
            assert.strictEqual(res2.body.failedAttempts, 2);
            assert.strictEqual(res2.body.attemptsRemaining, 3);
        });

        // TEST 5: Successful login resets failed attempts counter back to 0
        await test('5. Successful login immediately resets consecutive failed attempts counter to 0', async () => {
            const res = await makeRequest('POST', '/api/auth/authority-login', {
                identifier: 'AISTER23',
                password: '@aster23'
            }, { 'x-forwarded-for': '198.51.100.3' });

            assert.strictEqual(res.status, 200);

            const check = await db.get('SELECT failed_login_attempts, locked_until FROM authority_users WHERE username = ?', ['AISTER23']);
            assert.strictEqual(check.failed_login_attempts, 0);
            assert.strictEqual(check.locked_until, null);
        });

        // TEST 6: 5 consecutive failed attempts trigger 15-minute account lockout (HTTP 423)
        await test('6. 5 consecutive failed attempts trigger HTTP 423 lockout with remainingMinutes', async () => {
            for (let i = 1; i <= 4; i++) {
                const res = await makeRequest('POST', '/api/auth/authority-login', {
                    identifier: 'AISTER23',
                    password: `BadPass_${i}`
                }, { 'x-forwarded-for': '198.51.100.4' });
                assert.strictEqual(res.status, 401);
            }

            // 5th attempt locks the account
            const resLock = await makeRequest('POST', '/api/auth/authority-login', {
                identifier: 'AISTER23',
                password: 'BadPass_Final'
            }, { 'x-forwarded-for': '198.51.100.4' });

            assert.strictEqual(resLock.status, 423, `Expected HTTP 423 Locked, got ${resLock.status}: ${JSON.stringify(resLock.body)}`);
            assert.strictEqual(resLock.body.errorCode, 'ACCOUNT_LOCKED');
            assert.strictEqual(resLock.body.isLocked, true);
            assert.ok(resLock.body.remainingMinutes >= 14 && resLock.body.remainingMinutes <= 15, `Expected 14-15 minutes, got ${resLock.body.remainingMinutes}`);

            // Subsequent attempt even with correct password returns 423 while locked
            const resBlocked = await makeRequest('POST', '/api/auth/authority-login', {
                identifier: 'AISTER23',
                password: '@aster23'
            }, { 'x-forwarded-for': '198.51.100.4' });

            assert.strictEqual(resBlocked.status, 423);
            assert.strictEqual(resBlocked.body.errorCode, 'ACCOUNT_LOCKED');
        });

        // TEST 7: Isolation: Officer B (ndrf_commander) is NOT locked out when Admin A is locked
        await test('7. Admin isolation: Locking out Admin A does not lock out Officer B from same IP', async () => {
            const resB = await makeRequest('POST', '/api/auth/authority-login', {
                identifier: 'ndrf_commander',
                password: 'authority123'
            }, { 'x-forwarded-for': '198.51.100.4' }); // Same IP address!

            assert.strictEqual(resB.status, 200, `Officer B should log in successfully despite Admin A being locked from same IP`);
            assert.strictEqual(resB.body.success, true);
            assert.strictEqual(resB.body.user.role, 'AUTHORITY');
        });

        // TEST 8: Admin recovery request generates single-use token
        await test('8. Authority recovery request creates a single-use token in password_resets', async () => {
            const res = await makeRequest('POST', '/api/auth/authority-recovery-request', {
                identifier: 'AISTER23'
            }, { 'x-forwarded-for': '198.51.100.5' });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);

            // Get admin email
            const adminUser = await db.get(`SELECT email FROM authority_users WHERE username = 'AISTER23'`);
            const tokenRec = await db.get(
                `SELECT * FROM password_resets WHERE email = ? AND used = 0 ORDER BY created_at DESC LIMIT 1`,
                [adminUser.email]
            );
            assert.ok(tokenRec, 'Password reset token must be recorded');
            assert.strictEqual(tokenRec.used, 0);
        });

        // TEST 9: Secure admin unlock with recovery token
        await test('9. Unlocking locked admin account with valid recovery token releases lockout', async () => {
            const adminUser = await db.get(`SELECT email FROM authority_users WHERE username = 'AISTER23'`);
            const tokenRec = await db.get(
                `SELECT token FROM password_resets WHERE email = ? AND used = 0 ORDER BY created_at DESC LIMIT 1`,
                [adminUser.email]
            );
            const token = tokenRec.token;

            const resUnlock = await makeRequest('POST', '/api/auth/authority-unlock', {
                identifier: 'AISTER23',
                token: token
            }, { 'x-forwarded-for': '198.51.100.5' });

            assert.strictEqual(resUnlock.status, 200, `Expected 200, got ${resUnlock.status}: ${JSON.stringify(resUnlock.body)}`);
            assert.strictEqual(resUnlock.body.success, true);

            // Verify account is unlocked in DB
            const check = await db.get('SELECT failed_login_attempts, locked_until FROM authority_users WHERE username = ?', ['AISTER23']);
            assert.strictEqual(check.failed_login_attempts, 0);
            assert.strictEqual(check.locked_until, null);

            // Token should now be marked as used (single-use)
            const tokenCheck = await db.get('SELECT used FROM password_resets WHERE token = ?', [token]);
            assert.strictEqual(tokenCheck.used, 1, 'Token must be marked used');

            // Admin can now log in normally
            const loginRes = await makeRequest('POST', '/api/auth/authority-login', {
                identifier: 'AISTER23',
                password: '@aster23'
            }, { 'x-forwarded-for': '198.51.100.5' });

            assert.strictEqual(loginRes.status, 200);
            assert.strictEqual(loginRes.body.success, true);
        });

        // TEST 10: Automatic lockout expiry after time elapses
        await test('10. Expired lockout timestamp allows normal authentication without manual intervention', async () => {
            // Lock out Admin A again with an expired timestamp (1 minute in the past)
            const pastTimestamp = new Date(Date.now() - 60 * 1000).toISOString();
            await db.run(
                `UPDATE authority_users SET failed_login_attempts = 5, locked_until = ? WHERE username = 'AISTER23'`,
                [pastTimestamp]
            );

            // Attempt login with correct password
            const res = await makeRequest('POST', '/api/auth/authority-login', {
                identifier: 'AISTER23',
                password: '@aster23'
            }, { 'x-forwarded-for': '198.51.100.6' });

            assert.strictEqual(res.status, 200, `Expired lockout should allow login: ${JSON.stringify(res.body)}`);
            assert.strictEqual(res.body.success, true);

            // Verify lockout is cleared
            const check = await db.get('SELECT failed_login_attempts, locked_until FROM authority_users WHERE username = ?', ['AISTER23']);
            assert.strictEqual(check.failed_login_attempts, 0);
            assert.strictEqual(check.locked_until, null);
        });

        // TEST 11: Rate Limit Store Persistence in Database
        await test('11. Rate limiter records hits in the persistent database store', async () => {
            const ipTest = '203.0.113.99';
            // Send requests to auth endpoint
            await makeRequest('POST', '/api/auth/authority-login', {
                identifier: 'NonExistentUser',
                password: 'DummyPassword'
            }, { 'x-forwarded-for': ipTest });

            // Check if rate_limit_records has an entry for this IP
            const record = await db.get(
                `SELECT * FROM rate_limit_records WHERE key LIKE ?`,
                [`%${ipTest}%`]
            );
            assert.ok(record, 'Rate limit record should be written to database');
            assert.ok(record.total_hits >= 1, 'Hit count should be at least 1');
        });

        // TEST 12: Reverse Proxy IP header parsing
        await test('12. trust proxy=1 correctly identifies client IP from X-Forwarded-For header', async () => {
            const clientIp = '198.51.100.77';

            await makeRequest('POST', '/api/auth/authority-login', {
                identifier: 'NonExistentUser2',
                password: 'DummyPassword'
            }, { 'x-forwarded-for': clientIp });

            // Database should record the actual client IP (198.51.100.77)
            const record = await db.get(
                `SELECT * FROM rate_limit_records WHERE key LIKE ?`,
                [`%${clientIp}%`]
            );
            assert.ok(record, `Expected client IP ${clientIp} in rate limit records`);
        });

    } finally {
        if (testServer) {
            testServer.close();
        }
    }

    console.log('\n================================================================');
    console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test suite runner crashed:', err);
    process.exit(1);
});
