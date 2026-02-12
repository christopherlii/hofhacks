// Photo verification system for order completion
// Sellers must submit a photo proving they got the food

export interface VerificationPhoto {
  id: string;
  orderId: string;
  sellerId: string;
  photoUrl: string;
  capturedAt: Date;
  submittedAt: Date;
  location?: {
    lat: number;
    lng: number;
    accuracy: number;
  };
  status: 'pending' | 'accepted' | 'disputed';
}

// Time limit for submitting verification photo (in minutes)
// Sellers must send MMS photo within 3 minutes of marking en route
export const VERIFICATION_TIME_LIMIT_MINUTES = 3;

// Check if verification was submitted in time
export const isVerificationTimely = (
  orderAcceptedAt: Date,
  photoSubmittedAt: Date
): boolean => {
  const timeDiff = photoSubmittedAt.getTime() - orderAcceptedAt.getTime();
  const minutesDiff = timeDiff / (1000 * 60);
  return minutesDiff <= VERIFICATION_TIME_LIMIT_MINUTES;
};

// NYU Dining Hall locations for location verification
export const DINING_HALL_LOCATIONS = {
  lipton: { lat: 40.7295, lng: -73.9965, name: 'Lipton Dining Hall' },
  weinstein: { lat: 40.7290, lng: -73.9970, name: 'Weinstein Food Court' },
  palladium: { lat: 40.7335, lng: -73.9890, name: 'Palladium Dining Hall' },
  kimmel: { lat: 40.7295, lng: -73.9975, name: 'Kimmel Marketplace' },
};

// Check if photo was taken near the dining hall (within ~100 meters)
export const isNearDiningHall = (
  photoLocation: { lat: number; lng: number },
  diningHallId: string,
  maxDistanceMeters: number = 150
): boolean => {
  const hall = DINING_HALL_LOCATIONS[diningHallId as keyof typeof DINING_HALL_LOCATIONS];
  if (!hall) return false;

  const distance = calculateDistance(
    photoLocation.lat,
    photoLocation.lng,
    hall.lat,
    hall.lng
  );

  return distance <= maxDistanceMeters;
};

// Haversine formula for distance calculation
const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

// Camera capture utilities
export const capturePhoto = async (): Promise<{
  blob: Blob;
  timestamp: Date;
  location?: { lat: number; lng: number; accuracy: number };
}> => {
  return new Promise((resolve, reject) => {
    // Check for camera support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      reject(new Error('Camera not supported on this device'));
      return;
    }

    // Get user's location
    let location: { lat: number; lng: number; accuracy: number } | undefined;
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          location = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
        },
        () => {
          // Location not available - continue anyway
          console.log('Location not available');
        }
      );
    }

    // This would integrate with a camera component
    // For now, return a stub
    resolve({
      blob: new Blob(),
      timestamp: new Date(),
      location,
    });
  });
};
