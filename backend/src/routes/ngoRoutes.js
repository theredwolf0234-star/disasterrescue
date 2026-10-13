const express = require('express');
const router = express.Router();
const ngoController = require('../controllers/ngoController');
const { verifyToken, requireRoles } = require('../middleware/authMiddleware');
const { uploadEvidence } = require('../middleware/uploadMiddleware');

// 1. NGO Public Onboarding & Authentication
router.post('/register', uploadEvidence.single('verificationDoc'), ngoController.registerNgo);
router.post('/login', ngoController.loginNgo);

// 2. NGO Organization Directory & Review (Authority & Admin)
router.get('/directory', verifyToken, requireRoles(['AUTHORITY', 'ADMIN', 'NGO']), ngoController.getNgos);
router.get('/organization/:id', verifyToken, requireRoles(['AUTHORITY', 'ADMIN', 'NGO']), ngoController.getNgoById);
router.patch('/organization/:id/status', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), ngoController.updateNgoStatus);

// 3. NGO Dedicated Dashboard & Operations (Approved NGO only)
router.get('/dashboard', verifyToken, requireRoles(['NGO', 'ADMIN']), ngoController.getNgoDashboard);
router.post('/tasks/:taskId/respond', verifyToken, requireRoles(['NGO', 'ADMIN']), ngoController.respondToTask);
router.patch('/tasks/:taskId/progress', verifyToken, requireRoles(['NGO', 'ADMIN']), ngoController.updateTaskProgress);

// 4. Incident Assignment by Authority
router.post('/assign', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), ngoController.assignIncidentToNgo);

// 5. Volunteer Management
router.get('/volunteers', verifyToken, requireRoles(['NGO', 'AUTHORITY', 'ADMIN']), ngoController.getVolunteers);
router.post('/volunteers', verifyToken, requireRoles(['NGO', 'ADMIN']), ngoController.addVolunteer);
router.patch('/volunteers/:id', verifyToken, requireRoles(['NGO', 'ADMIN']), ngoController.updateVolunteerAssignment);

// 6. Relief Inventory Management
router.get('/inventory', verifyToken, requireRoles(['NGO', 'AUTHORITY', 'ADMIN']), ngoController.getNgoInventory);
router.post('/inventory', verifyToken, requireRoles(['NGO', 'ADMIN']), ngoController.updateNgoInventory);
router.put('/inventory', verifyToken, requireRoles(['NGO', 'ADMIN']), ngoController.updateNgoInventory);

// 7. Inter-Agency Coordination Messages
router.get('/coordination/:incidentId', verifyToken, requireRoles(['NGO', 'AUTHORITY', 'ADMIN']), ngoController.getCoordinationMessages);
router.post('/coordination/:incidentId', verifyToken, requireRoles(['NGO', 'AUTHORITY', 'ADMIN']), ngoController.sendCoordinationMessage);

module.exports = router;
