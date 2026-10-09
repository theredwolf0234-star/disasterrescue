const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incidentController');
const { verifyToken, optionalToken, requireRoles } = require('../middleware/authMiddleware');
const { uploadEvidence } = require('../middleware/uploadMiddleware');

// Overview statistics for dashboard counters (Restricted to AUTHORITY and ADMIN)
router.get('/stats/overview', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), incidentController.getIncidentStats);

// Analytics and reporting endpoints (BEFORE /:id parameter)
router.get('/analytics/summary', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), incidentController.getAnalyticsSummary);
router.get('/export/csv', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), incidentController.exportIncidentsCsv);

// List incidents: Citizen receives only own reports; Authority and Admin receive all
router.get('/', verifyToken, incidentController.getIncidents);

// Retrieve single incident with timeline notes: Citizen authorized for own only; Authority/Admin for all
router.get('/:id', verifyToken, incidentController.getIncidentById);

// Incident comprehensive report (PDF/Markdown format)
router.get('/:id/report', verifyToken, incidentController.getIncidentReport);

// Incident timeline history (Citizen for own, Authority/Admin for all)
router.get('/:id/timeline', verifyToken, incidentController.getIncidentTimeline);

// Submit new emergency SOS beacon (Citizen authenticated or guest emergency dispatch)
router.post('/', optionalToken, uploadEvidence.single('evidence'), incidentController.createIncident);

// Upload additional media evidence for an existing incident
router.post('/:id/evidence', optionalToken, uploadEvidence.single('evidence'), incidentController.uploadIncidentEvidence);

// Update incident status (Restricted to AUTHORITY and ADMIN)
router.patch('/:id', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), incidentController.updateIncident);
router.patch('/:id/status', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), incidentController.updateIncident);

// Update incident real-time GPS location telemetry (Citizen for own incident, Authority/Admin for any)
router.patch('/:id/location', verifyToken, incidentController.updateIncidentLocation);

// Assign rescue team (Restricted to AUTHORITY and ADMIN)
router.post('/:id/assign', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), incidentController.assignRescueTeam);

// Append incident timeline note (Authenticated: Citizen for own incident, Authority/Admin for any)
router.post('/:id/notes', verifyToken, incidentController.addIncidentNote);

module.exports = router;

