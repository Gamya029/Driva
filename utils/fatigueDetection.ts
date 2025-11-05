// This file contains utility functions for detecting driver fatigue 
// based on facial landmarks provided by face-api.js.

// Helper to calculate the Euclidean distance between two points
const getEuclideanDistance = (p1: { x: number; y: number }, p2: { x: number; y: number }): number => {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
};

/**
 * Calculates the Eye Aspect Ratio (EAR) for a single eye.
 * The EAR is a ratio of distances between vertical and horizontal eye landmarks.
 * A lower EAR indicates that the eye is more closed.
 * This is based on the paper "Real-Time Eye Blink Detection using Facial Landmarks"
 * by Tereza Soukupova and Jan Cech.
 * @param eyeLandmarks An array of 6 facial landmark points for one eye.
 * @returns The calculated Eye Aspect Ratio as a number.
 */
export const getEyeAspectRatio = (eyeLandmarks: { x: number; y: number }[]): number => {
    // eyeLandmarks are points p1 through p6 in the standard 68-point model
    const p1 = eyeLandmarks[0];
    const p2 = eyeLandmarks[1];
    const p3 = eyeLandmarks[2];
    const p4 = eyeLandmarks[3];
    const p5 = eyeLandmarks[4];
    const p6 = eyeLandmarks[5];

    // Compute the euclidean distances between the two sets of vertical eye landmarks
    const verticalDist1 = getEuclideanDistance(p2, p6);
    const verticalDist2 = getEuclideanDistance(p3, p5);

    // Compute the euclidean distance between the horizontal eye landmarks
    const horizontalDist = getEuclideanDistance(p1, p4);

    // Compute the eye aspect ratio
    const ear = (verticalDist1 + verticalDist2) / (2.0 * horizontalDist);
    
    return ear;
};
