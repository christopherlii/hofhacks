import React from 'react';
import { Clock, User, MapPin, CheckCircle, AlertCircle, Package } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Order, OrderStatus } from '@/types';
import { getOrderStatus } from '@/lib/orderService';

interface OrderTrackerProps {
  order: Order;
  userRole: 'buyer' | 'seller';
  onMarkReady?: () => void;
  onConfirmPickup?: () => void;
  onReportIssue?: () => void;
  onCancel?: () => void;
}

const STATUS_STEPS: OrderStatus[] = ['pending', 'accepted', 'preparing', 'ready', 'completed'];

export const OrderTracker: React.FC<OrderTrackerProps> = ({
  order,
  userRole,
  onMarkReady,
  onConfirmPickup,
  onReportIssue,
  onCancel,
}) => {
  const status = getOrderStatus(order.status);
  const currentStepIndex = STATUS_STEPS.indexOf(order.status);

  const getStepIcon = (step: OrderStatus, index: number) => {
    const isCompleted = index < currentStepIndex;
    const isCurrent = index === currentStepIndex;
    const baseClasses = 'w-10 h-10 rounded-full flex items-center justify-center';

    if (isCompleted) {
      return (
        <div className={`${baseClasses} bg-green-500`}>
          <CheckCircle className="w-6 h-6 text-white" />
        </div>
      );
    }

    if (isCurrent) {
      return (
        <div className={`${baseClasses} bg-nyu-violet animate-pulse`}>
          {step === 'pending' && <Clock className="w-6 h-6 text-white" />}
          {step === 'accepted' && <User className="w-6 h-6 text-white" />}
          {step === 'preparing' && <Package className="w-6 h-6 text-white" />}
          {step === 'ready' && <MapPin className="w-6 h-6 text-white" />}
          {step === 'completed' && <CheckCircle className="w-6 h-6 text-white" />}
        </div>
      );
    }

    return (
      <div className={`${baseClasses} bg-gray-200`}>
        <div className="w-3 h-3 rounded-full bg-gray-400" />
      </div>
    );
  };

  const getStepLabel = (step: OrderStatus): string => {
    const labels: Record<OrderStatus, string> = {
      pending: 'Finding Seller',
      accepted: 'Seller Found',
      preparing: 'Getting Food',
      ready: 'Ready',
      completed: 'Done',
      cancelled: 'Cancelled',
      disputed: 'Disputed',
    };
    return labels[step];
  };

  return (
    <Card>
      <CardContent className="py-4">
        {/* Order Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-gray-500">Order #{order.id.slice(-8)}</p>
            <h3 className="font-semibold text-gray-900">{status.label}</h3>
          </div>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium
              ${status.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' : ''}
              ${status.color === 'blue' ? 'bg-blue-100 text-blue-800' : ''}
              ${status.color === 'green' ? 'bg-green-100 text-green-800' : ''}
              ${status.color === 'gray' ? 'bg-gray-100 text-gray-800' : ''}
              ${status.color === 'red' ? 'bg-red-100 text-red-800' : ''}
            `}
          >
            {status.label}
          </span>
        </div>

        {/* Progress Steps */}
        {order.status !== 'cancelled' && order.status !== 'disputed' && (
          <div className="relative mb-6">
            {/* Progress Line */}
            <div className="absolute top-5 left-5 right-5 h-0.5 bg-gray-200">
              <div
                className="h-full bg-green-500 transition-all duration-500"
                style={{
                  width: `${(currentStepIndex / (STATUS_STEPS.length - 1)) * 100}%`,
                }}
              />
            </div>

            {/* Steps */}
            <div className="relative flex justify-between">
              {STATUS_STEPS.slice(0, -1).map((step, index) => (
                <div key={step} className="flex flex-col items-center">
                  {getStepIcon(step, index)}
                  <span className="mt-2 text-xs text-gray-600 text-center w-16">
                    {getStepLabel(step)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Order Details */}
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <h4 className="font-medium text-gray-900 mb-2">Order Details</h4>
          <div className="space-y-1">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-600">
                  {item.quantity}x {item.menuItemName}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 mt-2 pt-2">
            <div className="flex justify-between text-sm font-medium">
              <span>Total</span>
              <span>${(order.totalAmount / 100).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Pickup Info */}
        <div className="flex items-start space-x-3 mb-4">
          <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-gray-900">{order.diningHall}</p>
            <p className="text-sm text-gray-500">{order.pickupLocation}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          {/* Seller actions */}
          {userRole === 'seller' && order.status === 'accepted' && onMarkReady && (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={onMarkReady}
            >
              Mark as Ready (Take Photo)
            </Button>
          )}

          {/* Buyer actions */}
          {userRole === 'buyer' && order.status === 'ready' && onConfirmPickup && (
            <Button
              variant="primary"
              size="lg"
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={onConfirmPickup}
            >
              Confirm Pickup
            </Button>
          )}

          {/* Common actions */}
          {order.status !== 'completed' && order.status !== 'cancelled' && (
            <div className="flex gap-2">
              {onReportIssue && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                  leftIcon={<AlertCircle className="w-4 h-4" />}
                  onClick={onReportIssue}
                >
                  Report Issue
                </Button>
              )}
              {order.status === 'pending' && onCancel && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={onCancel}
                >
                  Cancel Order
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
