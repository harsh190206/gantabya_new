import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaBus, FaSave, FaTimes } from 'react-icons/fa';
import AdminLayout from '../components/AdminLayout';
import api from '../lib/api';

interface BusFormData {
  busNumber: string;
  name: string;
  type: 'SEATER' | 'SLEEPER' | 'MIXED';
  layoutType: 'TWO_TWO' | 'THREE_TWO' | 'FOUR_TWO' | 'FOUR_FOUR';
  gridRows: number;
  gridColumns: number;
}

const BusForm: React.FC = () => {
  const navigate = useNavigate();
  const { busId } = useParams<{ busId: string }>();
  const isEditMode = busId && busId !== 'new';

  const [formData, setFormData] = useState<BusFormData>({
    busNumber: '',
    name: '',
    type: 'MIXED',
    layoutType: 'TWO_TWO',
    gridRows: 15, // Bus length (front to back) - realistic layout
    gridColumns: 4, // Bus width (side to side) - narrow like real bus
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (isEditMode) {
      fetchBusDetails();
    }
  }, [isEditMode]);

  const fetchBusDetails = async () => {
    try {
      const response = await api.get(`/admin/bus/${busId}`);
      const bus = response.data.bus;
      setFormData({
        busNumber: bus.busNumber,
        name: bus.name,
        type: bus.type,
        layoutType: bus.layoutType,
        gridRows: bus.gridRows,
        gridColumns: bus.gridColumns,
      });
    } catch (err: any) {
      setError(err.response?.data?.errorMessage || 'Failed to load bus details');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: ['gridRows', 'gridColumns'].includes(name) 
        ? parseFloat(value) || 0 
        : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.busNumber || !formData.name) {
      setError('Bus number and name are required');
      return;
    }

    setLoading(true);

    try {
      if (isEditMode) {
        await api.patch(`/admin/bus/${busId}`, formData);
        setSuccess('Bus updated successfully!');
      } else {
        const response = await api.post('/admin/bus/create', formData);
        setSuccess('Bus created successfully!');
        const newBusId = response.data.bus.id;
        setTimeout(() => {
          navigate(`/plus/buses/${newBusId}/seats`);
        }, 1500);
      }
    } catch (err: any) {
      setError(err.response?.data?.errorMessage || 'Failed to save bus');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 flex items-center space-x-3">
            <FaBus className="text-yellow-500" />
            <span>{isEditMode ? 'Edit Bus' : 'Add New Bus'}</span>
          </h1>
          <p className="text-gray-600 mt-1">
            {isEditMode
              ? 'Update bus information'
              : 'Create a new bus and configure its layout'}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Bus Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bus Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="busNumber"
                value={formData.busNumber}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                placeholder="e.g., KA-01-1234"
                required
              />
            </div>

            {/* Bus Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bus Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                placeholder="e.g., Volvo Multi-Axle"
                required
              />
            </div>

            {/* Bus Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bus Type <span className="text-red-500">*</span>
              </label>
              <select
                name="type"
                value={formData.type}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              >
                <option value="SEATER">Seater (All seated)</option>
                <option value="SLEEPER">Sleeper (All sleeper)</option>
                <option value="MIXED">Mixed (Seater + Sleeper)</option>
              </select>
              <p className="text-sm text-gray-500 mt-1">
                Choose MIXED if your bus has both seater and sleeper seats
              </p>
            </div>

            {/* Layout Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Layout Type <span className="text-red-500">*</span>
              </label>
              <select
                name="layoutType"
                value={formData.layoutType}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              >
                <option value="TWO_TWO">2+2 (4 seats per row)</option>
                <option value="THREE_TWO">3+2 (5 seats per row)</option>
                <option value="FOUR_TWO">4+2 (6 seats per row)</option>
                <option value="FOUR_FOUR">4+4 (8 seats per row)</option>
              </select>
              <p className="text-sm text-gray-500 mt-1">
                Standard seating configuration (excluding aisle)
              </p>
            </div>

            {/* Grid Dimensions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Grid Rows (Bus Length)
                </label>
                <input
                  type="number"
                  name="gridRows"
                  value={formData.gridRows}
                  onChange={handleChange}
                  min="1"
                  max="15"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">Front to back - max 15 rows</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Grid Columns (Bus Width)
                </label>
                <input
                  type="number"
                  name="gridColumns"
                  value={formData.gridColumns}
                  onChange={handleChange}
                  min="1"
                  max="8"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">Side to side - max 8 columns</p>
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Realistic Bus Layout:</strong> The grid is now oriented like a real bus!
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Rows = Bus length (front to back, max 15)</li>
                  <li>Columns = Bus width (side to side, max 4)</li>
                  <li>Driver position will appear at top-right (realistic placement)</li>
                  <li>After creating, design seat layout with our interactive grid</li>
                </ul>
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center space-x-2 px-6 py-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                <FaSave />
                <span>{loading ? 'Saving...' : isEditMode ? 'Update Bus' : 'Create Bus'}</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/plus/buses')}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition flex items-center justify-center space-x-2"
              >
                <FaTimes />
                <span>Cancel</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
};

export default BusForm;
