import express from "express";
import { protect } from "../middlewares/authMiddlewware.js";
import { addAccount, disconnectAccount, getAccounts, getPlatforms } from "../controllers/accountControllers.js";

const accountRouter = express.Router();

accountRouter.get('/platforms', protect, getPlatforms);
accountRouter.get('/', protect, getAccounts);
accountRouter.post('/', protect, addAccount);
accountRouter.delete('/:id', protect, disconnectAccount);

export default accountRouter;