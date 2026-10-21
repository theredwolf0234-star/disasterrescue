const express = require('express');
const router = express.Router();
const rescueTeamController = require('../controllers/rescueTeamController');
const { verifyToken, requireRoles } = require('../middleware/authMiddleware');

router.get('/', rescueTeamController.getRescueTeams);
router.get('/suitable', verifyToken, rescueTeamController.getSuitableTeams);
router.post('/', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), rescueTeamController.createRescueTeam);
router.patch('/:id', verifyToken, requireRoles(['AUTHORITY', 'ADMIN', 'RESPONDER']), rescueTeamController.updateRescueTeam);
router.patch('/:id/status', verifyToken, requireRoles(['AUTHORITY', 'ADMIN', 'RESPONDER']), rescueTeamController.updateRescueTeam);
router.post('/:id/acknowledge', verifyToken, rescueTeamController.acknowledgeDispatch);
router.post('/:id/decline', verifyToken, rescueTeamController.declineDispatch);
router.post('/:id/location', verifyToken, requireRoles(['AUTHORITY', 'ADMIN', 'RESPONDER']), rescueTeamController.updateTeamLocation);
router.get('/:id/location', verifyToken, rescueTeamController.getTeamLocation);
router.get('/:id/assignments', verifyToken, rescueTeamController.getTeamAssignments);

module.exports = router;

