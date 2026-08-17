import mongoose from "mongoose";
import { env } from "./env.js";
import { logError } from "../utils/redact.js";

const connectDB = async () => {
    try {
        mongoose.connection.on("connected", async () => {
            console.log('MongoDB connected')
        });
        await mongoose.connect(env.mongoUri)
    } catch (error: any) {
        // The URI carries credentials and Mongo echoes it back in connection
        // errors, so this must go through the redactor.
        logError("MongoDB connection failed", error)
        process.exit(1)
    }
}

export default connectDB;
