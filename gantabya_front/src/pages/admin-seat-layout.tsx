import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaSave, FaBed, FaChair, FaTimes, FaLayerGroup, FaArrowLeft, FaMale, FaFemale } from 'react-icons/fa';
import { GiSteeringWheel } from 'react-icons/gi';
import AdminLayout from '../components/AdminLayout';
import api from '../lib/api';

interface SeatData {
  seatNumber: string;
  type: 'SEATER' | 'SLEEPER' | 'EMPTY';
  spanning?: boolean; // If this cell is part of a multi-cell sleeper
  isFemale?: boolean; // Reserved for female passengers
}

interface Bus {
  id: string;
  busNumber: string;
  name: string;
  gridRows: number;
  gridColumns: number;
}

interface SeatFromBackend {
  id: string;
  seatNumber: string;
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
  type: 'SEATER' | 'SLEEPER';
  isActive: boolean;
  isFemale?: boolean;
}

const SeatLayoutDesigner: React.FC = () => {
  const { busId } = useParams<{ busId: string }>();
  const navigate = useNavigate();

  const [bus, setBus] = useState<Bus | null>(null);
  const [activeLevel, setActiveLevel] = useState<'LOWER' | 'UPPER'>('LOWER');
  const [lowerDeckGrid, setLowerDeckGrid] = useState<SeatData[][]>([]);
  const [upperDeckGrid, setUpperDeckGrid] = useState<SeatData[][]>([]);
  const [editingCell, setEditingCell] = useState<{row: number; col: number} | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [femaleMode, setFemaleMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (busId) {
      fetchBusDetails();
    }
  }, [busId]);

  const fetchBusDetails = async () => {
    try {
      const busResponse = await api.get(`/admin/bus/${busId}`);
      const busData = busResponse.data.bus;
      setBus(busData);

      // Try to fetch existing seat layout
      try {
        const seatsResponse = await api.get(`/admin/bus/${busId}/seats`);
        const { seats, bus: busInfo } = seatsResponse.data;

        // Initialize grids with existing seats
        const emptyLower = createEmptyGrid(busInfo.gridRows, busInfo.gridColumns);
        const emptyUpper = createEmptyGrid(busInfo.gridRows, busInfo.gridColumns);

        // Populate lower deck seats
        if (seats.lowerDeck && seats.lowerDeck.length > 0) {
          populateGridFromSeats(emptyLower, seats.lowerDeck);
        }

        // Populate upper deck seats
        if (seats.upperDeck && seats.upperDeck.length > 0) {
          populateGridFromSeats(emptyUpper, seats.upperDeck);
        }

        setLowerDeckGrid(emptyLower);
        setUpperDeckGrid(emptyUpper);
      } catch (seatErr) {
        // No existing seats, start with empty grids
        const emptyLower = createEmptyGrid(busData.gridRows, busData.gridColumns);
        const emptyUpper = createEmptyGrid(busData.gridRows, busData.gridColumns);
        setLowerDeckGrid(emptyLower);
        setUpperDeckGrid(emptyUpper);
      }
    } catch (err: any) {
      setError(err.response?.data?.errorMessage || 'Failed to load bus details');
    } finally {
      setLoading(false);
    }
  };

  const createEmptyGrid = (rows: number, cols: number): SeatData[][] => {
    return Array(rows).fill(null).map(() =>
      Array(cols).fill(null).map(() => ({ seatNumber: '', type: 'EMPTY' as const }))
    );
  };

  const populateGridFromSeats = (grid: SeatData[][], seats: SeatFromBackend[]) => {
    seats.forEach(seat => {
      const { row, column, rowSpan, columnSpan, seatNumber, type, isFemale } = seat;

      // Fill all cells occupied by this seat
      for (let r = row; r < row + rowSpan; r++) {
        for (let c = column; c < column + columnSpan; c++) {
          if (r < grid.length && c < grid[0].length) {
            grid[r][c] = {
              seatNumber,
              type,
              spanning: r !== row || c !== column, // First cell is main, others are spanning
              isFemale: !!isFemale,
            };
          }
        }
      }
    });
  };

  const handleCellClick = (row: number, col: number) => {
    const currentGrid = activeLevel === 'LOWER' ? [...lowerDeckGrid] : [...upperDeckGrid];
    const cell = currentGrid[row][col];

    if (femaleMode) {
      if (!cell.seatNumber) return;
      const seatNumber = cell.seatNumber;
      const newFemale = !cell.isFemale;
      currentGrid.forEach((r, ri) =>
        r.forEach((c, ci) => {
          if (c.seatNumber === seatNumber) {
            currentGrid[ri][ci] = { ...c, isFemale: newFemale };
          }
        })
      );
      if (activeLevel === 'LOWER') setLowerDeckGrid(currentGrid);
      else setUpperDeckGrid(currentGrid);
      return;
    }

    // If cell already has a seat, start editing it
    if (cell.seatNumber && !cell.spanning) {
      setEditingCell({ row, col });
      setInputValue(cell.seatNumber);
    } else if (!cell.seatNumber) {
      // Empty cell - start editing to add new seat
      setEditingCell({ row, col });
      setInputValue('');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow numbers and letters
    if (/^[A-Za-z0-9]*$/.test(value)) {
      setInputValue(value);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    if (e.key === 'Enter') {
      handleSaveSeatNumber(row, col);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setInputValue('');
    }
  };

  const handleSaveSeatNumber = (row: number, col: number) => {
    const currentGrid = activeLevel === 'LOWER' ? [...lowerDeckGrid] : [...upperDeckGrid];
    const trimmedValue = inputValue.trim();

    if (!trimmedValue) {
      // Empty input - clear the cell
      handleClearCell(row, col);
      setEditingCell(null);
      setInputValue('');
      return;
    }

    // Find ALL cells with this seat number (including sleeper cells)
    const existingCells = findAllCellsWithNumber(currentGrid, trimmedValue);
    
    // Filter out the current cell we're editing
    const otherCells = existingCells.filter(cell => cell.row !== row || cell.col !== col);
    
    if (otherCells.length > 0) {
      // Check if cells are all in the same row (horizontal sleeper)
      const allSameRow = otherCells.every(cell => cell.row === row);
      
      if (allSameRow) {
        // Horizontal sleeper - check if adjacent and max 4 cells total
        const allCols = [...otherCells.map(c => c.col), col].sort((a, b) => a - b);
        const isContiguous = allCols.every((colNum, idx) => 
          idx === 0 || colNum === allCols[idx - 1] + 1
        );
        
        if (!isContiguous) {
          setError(`For horizontal sleeper, cells must be adjacent! Seat number "${trimmedValue}" has gaps.`);
          return;
        }
        
        if (otherCells.length >= 4) {
          setError(`Horizontal sleeper can have maximum 4 cells! Seat "${trimmedValue}" already has ${otherCells.length} cells.`);
          return;
        }
        // Valid horizontal sleeper expansion - continue
      } else {
        // Check if all in same column (vertical sleeper)
        const allSameCol = otherCells.every(cell => cell.col === col);
        
        if (allSameCol) {
          // Vertical sleeper - check if adjacent and max 2 cells total
          const allRows = [...otherCells.map(c => c.row), row].sort((a, b) => a - b);
          const isContiguous = allRows.every((rowNum, idx) => 
            idx === 0 || rowNum === allRows[idx - 1] + 1
          );
          
          if (!isContiguous) {
            setError(`For vertical sleeper, cells must be adjacent! Seat number "${trimmedValue}" has gaps.`);
            return;
          }
          
          if (otherCells.length >= 2) {
            setError(`Vertical sleeper can have maximum 2 cells! Seat "${trimmedValue}" already has ${otherCells.length} cells.`);
            return;
          }
          // Valid vertical sleeper expansion - continue
        } else {
          // Cells are neither all in same row nor all in same column
          setError(`Seat number "${trimmedValue}" exists in different rows and columns! Sleepers must be in a straight line.`);
          return;
        }
      }
    }

    // Determine seat type - default to SEATER for single cells
    const oldCell = currentGrid[row][col];
    
    // If cell was part of a sleeper, clear the entire sleeper first
    if (oldCell.seatNumber && oldCell.type === 'SLEEPER') {
      clearSleeperSeats(currentGrid, oldCell.seatNumber);
    }

    // Set as seater by default
    currentGrid[row][col] = {
      seatNumber: trimmedValue,
      type: 'SEATER',
      spanning: false,
    };

    // Check if adjacent cells have the same number - convert to sleeper
    detectAndConvertToSleeper(currentGrid, row, col, trimmedValue);

    if (activeLevel === 'LOWER') {
      setLowerDeckGrid(currentGrid);
    } else {
      setUpperDeckGrid(currentGrid);
    }

    setEditingCell(null);
    setInputValue('');
    setError('');
  };

  const findAllCellsWithNumber = (grid: SeatData[][], seatNumber: string): {row: number; col: number}[] => {
    const cells: {row: number; col: number}[] = [];
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c].seatNumber === seatNumber) {
          cells.push({ row: r, col: c });
        }
      }
    }
    return cells;
  };

  const clearSleeperSeats = (grid: SeatData[][], seatNumber: string) => {
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c].seatNumber === seatNumber) {
          grid[r][c] = { seatNumber: '', type: 'EMPTY' };
        }
      }
    }
  };

  const detectAndConvertToSleeper = (grid: SeatData[][], row: number, col: number, seatNumber: string) => {
    // Find all cells with the same seat number
    const sameSeatCells = findAllCellsWithNumber(grid, seatNumber);
    
    if (sameSeatCells.length === 1) {
      // Only one cell - keep as SEATER
      return;
    }
    
    // Check if all cells are in the same row (horizontal sleeper)
    const allSameRow = sameSeatCells.every(cell => cell.row === row);
    
    if (allSameRow) {
      // Sort cells by column
      const sortedCells = sameSeatCells.sort((a, b) => a.col - b.col);
      
      // Mark first cell as non-spanning, rest as spanning
      sortedCells.forEach((cell, idx) => {
        grid[cell.row][cell.col].type = 'SLEEPER';
        grid[cell.row][cell.col].spanning = idx > 0;
      });
      return;
    }
    
    // Check if all cells are in the same column (vertical sleeper)
    const allSameCol = sameSeatCells.every(cell => cell.col === col);
    
    if (allSameCol) {
      // Sort cells by row
      const sortedCells = sameSeatCells.sort((a, b) => a.row - b.row);
      
      // Mark first cell as non-spanning, rest as spanning
      sortedCells.forEach((cell, idx) => {
        grid[cell.row][cell.col].type = 'SLEEPER';
        grid[cell.row][cell.col].spanning = idx > 0;
      });
      return;
    }
  };

  const handleClearCell = (row: number, col: number) => {
    const currentGrid = activeLevel === 'LOWER' ? [...lowerDeckGrid] : [...upperDeckGrid];
    const cell = currentGrid[row][col];

    if (cell.type === 'SLEEPER' && cell.seatNumber) {
      // Clear all cells with same seat number (entire sleeper)
      const seatNumber = cell.seatNumber;
      currentGrid.forEach((r, i) => {
        r.forEach((c, j) => {
          if (c.seatNumber === seatNumber) {
            currentGrid[i][j] = { seatNumber: '', type: 'EMPTY' };
          }
        });
      });
    } else {
      // Clear single cell
      currentGrid[row][col] = { seatNumber: '', type: 'EMPTY' };
    }

    if (activeLevel === 'LOWER') {
      setLowerDeckGrid(currentGrid);
    } else {
      setUpperDeckGrid(currentGrid);
    }

    setEditingCell(null);
    setInputValue('');
  };

  const handleSaveLayout = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Backend expects grid in this exact format
      const stripGrid = (g: SeatData[][]) =>
        g.map((row) =>
          row.map((c) => ({ seatNumber: c.seatNumber || '', isFemale: !!c.isFemale }))
        );
      await api.post(`/admin/bus/${busId}/seats/layout`, {
        lowerDeckGrid: stripGrid(lowerDeckGrid),
        upperDeckGrid: countSeats(upperDeckGrid) > 0 ? stripGrid(upperDeckGrid) : undefined,
      });

      setSuccess('Seat layout saved successfully! Users can now book seats on this bus.');
      setTimeout(() => {
        navigate('/plus/buses');
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.errorMessage || 'Failed to save layout');
    } finally {
      setSaving(false);
    }
  };

  const countSeats = (grid: SeatData[][]) => {
    const uniqueSeats = new Set<string>();
    grid.forEach(row => {
      row.forEach(cell => {
        if (cell.seatNumber) uniqueSeats.add(cell.seatNumber);
      });
    });
    return uniqueSeats.size;
  };

  const getCellStyle = (cell: SeatData, row: number, col: number) => {
    const isEditing = editingCell && editingCell.row === row && editingCell.col === col;

    if (cell.type === 'EMPTY') {
      return `border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer ${isEditing ? 'ring-4 ring-blue-400' : ''}`;
    }
    if (cell.isFemale) {
      return `border-2 border-pink-500 bg-pink-200 hover:bg-pink-300 cursor-pointer ${isEditing ? 'ring-4 ring-blue-400' : ''}`;
    }
    if (cell.type === 'SEATER') {
      return `border-2 border-blue-500 bg-blue-100 hover:bg-blue-200 cursor-pointer ${isEditing ? 'ring-4 ring-blue-400' : ''}`;
    }
    if (cell.type === 'SLEEPER') {
      return `border-2 border-purple-500 bg-purple-100 hover:bg-purple-200 cursor-pointer ${isEditing ? 'ring-4 ring-blue-400' : ''}`;
    }
    return '';
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
        </div>
      </AdminLayout>
    );
  }

  if (!bus) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-red-600">Bus not found</p>
        </div>
      </AdminLayout>
    );
  }

  const currentGrid = activeLevel === 'LOWER' ? lowerDeckGrid : upperDeckGrid;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Seat Layout Designer</h1>
            <p className="text-gray-600 mt-1">
              {bus.busNumber} - {bus.name}
            </p>
          </div>
          <button
            onClick={() => navigate('/plus/buses')}
            className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-800 self-start sm:self-auto"
          >
            <FaArrowLeft />
            <span>Back to Buses</span>
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg">
            {success}
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-bold text-blue-900 mb-3">How to Design Seat Layout:</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-blue-800">
            <div>
              <p className="font-semibold mb-2">Adding Seats:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Click any cell</strong> to enter seat number</li>
                <li><strong>Type number</strong> (e.g., 1, 2, 3) using keyboard</li>
                <li><strong>Press Enter</strong> to save the seat</li>
                <li><strong>Single cell</strong> = Seater seat (blue)</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold mb-2">Creating Sleepers:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Enter <strong>same number</strong> in 2 adjacent cells</li>
                <li>System automatically converts to sleeper (purple)</li>
                <li>Works horizontally or vertically</li>
                <li>Example: Put "5" in two side-by-side cells</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold mb-2">Removing Seats:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Right-click</strong> on any seat to remove it</li>
                <li>Or click cell and clear the number</li>
                <li>For sleepers, removes the entire seat</li>
                <li><strong>Press Escape</strong> to cancel editing</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Female Seat Mode */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <button
            onClick={() => setFemaleMode((v) => !v)}
            className={`px-4 py-2 rounded-lg font-semibold border-2 flex items-center gap-2 transition ${
              femaleMode
                ? 'bg-pink-500 text-white border-pink-600'
                : 'bg-white text-pink-600 border-pink-300 hover:bg-pink-50'
            }`}
          >
            <FaFemale />
            {femaleMode ? 'Female Mode ON — click seat to toggle' : 'Mark Female Seat'}
          </button>
          {femaleMode && (
            <p className="text-xs text-pink-700 bg-pink-50 px-3 py-2 rounded-lg">
              Pink seats reserved for female passengers. Click again to unmark.
            </p>
          )}
        </div>

        {/* Deck Selector and Stats */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div className="flex items-center space-x-2 bg-white rounded-lg shadow p-1">
            <button
              onClick={() => setActiveLevel('LOWER')}
              className={`px-6 py-2 rounded-md transition flex items-center space-x-2 ${
                activeLevel === 'LOWER'
                  ? 'bg-yellow-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FaLayerGroup />
              <span>Lower Deck</span>
            </button>
            <button
              onClick={() => setActiveLevel('UPPER')}
              className={`px-6 py-2 rounded-md transition flex items-center space-x-2 ${
                activeLevel === 'UPPER'
                  ? 'bg-yellow-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FaLayerGroup />
              <span>Upper Deck</span>
            </button>
          </div>

          <div className="flex items-center flex-wrap gap-4 sm:space-x-6 text-sm">
            <div className="flex items-center space-x-2">
              <FaChair className="text-blue-500 text-xl" />
              <span className="text-gray-700">Seaters: {countSeats(lowerDeckGrid)}</span>
            </div>
            <div className="flex items-center space-x-2">
              <FaLayerGroup className="text-purple-500 text-xl" />
              <span className="text-gray-700">Upper: {countSeats(upperDeckGrid)}</span>
            </div>
            <div className="text-lg font-bold text-gray-800">
              Total: {countSeats(lowerDeckGrid) + countSeats(upperDeckGrid)} seats
            </div>
          </div>
        </div>

        {/* Legend and Sample */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-bold text-gray-800 mb-3">Legend:</h3>
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 border-2 border-dashed border-gray-300 bg-gray-50 rounded"></div>
                <span className="text-gray-700">Empty (Aisle)</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 border-2 border-blue-500 bg-blue-100 rounded flex items-center justify-center font-bold text-blue-700">1</div>
                <span className="text-gray-700">Seater</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex space-x-1">
                  <div className="w-12 h-12 border-2 border-purple-500 bg-purple-100 rounded flex items-center justify-center font-bold text-purple-700">2</div>
                  <div className="w-12 h-12 border-2 border-purple-500 bg-purple-100 rounded flex items-center justify-center font-bold text-purple-700">2</div>
                </div>
                <span className="text-gray-700">Horizontal Sleeper</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex flex-col space-y-1">
                  <div className="w-12 h-12 border-2 border-purple-500 bg-purple-100 rounded flex flex-col items-center justify-center">
                    <FaBed className="text-purple-600 text-lg" />
                    <div className="flex items-center gap-0.5 text-[8px]">
                      <FaMale className="text-blue-500" />
                      <FaFemale className="text-pink-500" />
                    </div>
                  </div>
                  <div className="w-12 h-12 border-2 border-purple-500 bg-purple-100 rounded flex items-center justify-center font-bold text-purple-700">3</div>
                </div>
                <span className="text-gray-700">Vertical Sleeper (Couple Seat)</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 border-2 border-pink-500 bg-pink-200 rounded flex flex-col items-center justify-center">
                  <FaFemale className="text-pink-600 text-base" />
                  <span className="text-pink-700 font-bold text-[10px]">F</span>
                </div>
                <span className="text-gray-700">Female-only Seat</span>
              </div>
            </div>
          </div>
        </div>

        {/* Seat Grid */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">
              {activeLevel === 'LOWER' ? 'Lower Deck' : 'Upper Deck'} Layout
            </h2>
            {editingCell && (
              <div className="text-sm text-blue-600 font-semibold">
                Editing seat... (Press Enter to save, Escape to cancel)
              </div>
            )}
          </div>

          {/* Centered and Responsive Container */}
          <div className="flex justify-center items-center w-full">
            <div className="overflow-x-auto">
              <div className="inline-block">
                {/* Realistic Bus Layout Container */}
                <div className="relative">
                {/* Bus Frame - Big Border */}
                <div className="border-8 border-gray-800 rounded-3xl bg-gradient-to-b from-gray-100 to-gray-200 p-6 shadow-2xl" style={{ minWidth: 'fit-content' }}>
                  
                  {/* Bus Front Section with Driver */}
                  <div className="flex justify-between items-center mb-4 pb-4 border-b-4 border-gray-800">
                    {/* Windshield/Front Indicator */}
                    <div className="flex items-center gap-2 bg-blue-100 border-2 border-blue-400 rounded-lg px-4 py-2">
                      <div className="text-xs font-bold text-blue-700">← FRONT →</div>
                    </div>
                    
                    {/* Driver Position - Top Right */}
                    <div className="flex items-center gap-2 bg-yellow-100 border-3 border-yellow-500 rounded-xl px-4 py-3 shadow-lg">
                      <GiSteeringWheel className="text-yellow-600 text-3xl" />
                      <span className="text-sm font-bold text-yellow-700">DRIVER</span>
                    </div>
                  </div>

                  {/* Seat Grid - Rotated 90° (4 columns wide, up to 15 rows long) */}
                  <div className="flex flex-col gap-2">
                    {currentGrid.map((row, rowIndex) => (
                      <div key={rowIndex} className="flex gap-2 justify-center">
                        {row.map((cell, colIndex) => {
                          // Check if this is a vertical sleeper (cell below has same seat number)
                          const cellBelow = currentGrid[rowIndex + 1]?.[colIndex];
                          const isVerticalSleeper = cell.type === 'SLEEPER' &&
                            !cell.spanning &&
                            cellBelow?.seatNumber === cell.seatNumber;

                          // Couple seat: TWO vertical sleepers side by side (adjacent columns)
                          // Check if adjacent column (left or right) also has a vertical sleeper
                          const hasAdjacentVerticalSleeper = (adjColIndex: number) => {
                            const adjCell = currentGrid[rowIndex]?.[adjColIndex];
                            const adjCellBelow = currentGrid[rowIndex + 1]?.[adjColIndex];
                            return adjCell?.type === 'SLEEPER' &&
                              !adjCell?.spanning &&
                              adjCellBelow?.seatNumber === adjCell?.seatNumber;
                          };

                          const isCoupeSeat = isVerticalSleeper && (
                            hasAdjacentVerticalSleeper(colIndex - 1) || hasAdjacentVerticalSleeper(colIndex + 1)
                          );

                          return (
                          <div
                            key={`${rowIndex}-${colIndex}`}
                            onClick={() => handleCellClick(rowIndex, colIndex)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              if (cell.seatNumber) handleClearCell(rowIndex, colIndex);
                            }}
                            className={`
                              w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16
                              rounded-lg flex items-center justify-center font-bold text-sm
                              transition-all duration-200 transform hover:scale-105 cursor-pointer
                              ${getCellStyle(cell, rowIndex, colIndex)}
                            `}
                            title={cell.seatNumber ? `Seat ${cell.seatNumber} (${cell.type})${isCoupeSeat ? ' - Couple Seat' : ''}` : 'Empty - Click to add seat'}
                          >
                            {editingCell && editingCell.row === rowIndex && editingCell.col === colIndex ? (
                              <input
                                type="text"
                                value={inputValue}
                                onChange={handleInputChange}
                                onKeyDown={(e) => handleInputKeyDown(e, rowIndex, colIndex)}
                                onBlur={() => handleSaveSeatNumber(rowIndex, colIndex)}
                                autoFocus
                                className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-center font-bold text-sm sm:text-base md:text-lg border-2 border-blue-500 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                                placeholder="#"
                                maxLength={3}
                              />
                            ) : (
                              <>
                                {cell.seatNumber && (
                                  <div className="flex flex-col items-center justify-center">
                                    {cell.type === 'SEATER' && (
                                      <>
                                        {cell.isFemale ? (
                                          <FaFemale className="text-pink-600 text-sm sm:text-lg md:text-xl lg:text-2xl mb-0.5" />
                                        ) : (
                                          <FaChair className="text-blue-600 text-sm sm:text-lg md:text-xl lg:text-2xl mb-0.5" />
                                        )}
                                        <span className={`${cell.isFemale ? 'text-pink-700' : 'text-blue-700'} font-bold text-[0.55rem] sm:text-xs md:text-sm`}>
                                          {cell.isFemale ? `F-${cell.seatNumber}` : cell.seatNumber}
                                        </span>
                                      </>
                                    )}
                                    {cell.type === 'SLEEPER' && (
                                      <>
                                        <FaBed className={`${cell.isFemale ? 'text-pink-600' : 'text-purple-600'} text-sm sm:text-lg md:text-xl lg:text-2xl mb-0.5`} />
                                        {isCoupeSeat && (
                                          <div className="flex items-center gap-0.5 text-[8px] sm:text-[10px]">
                                            <FaMale className="text-blue-500" />
                                            <FaFemale className="text-pink-500" />
                                          </div>
                                        )}
                                        <span className={`${cell.isFemale ? 'text-pink-700' : 'text-purple-700'} font-bold text-[0.55rem] sm:text-xs md:text-sm`}>
                                          {cell.isFemale ? `F-${cell.seatNumber}` : cell.seatNumber}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {/* Bus Back Section */}
                  <div className="mt-4 pt-4 border-t-4 border-gray-800 text-center">
                    <div className="text-xs font-bold text-gray-600 bg-gray-300 rounded-lg py-2">BACK</div>
                  </div>
                  
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-4">
          <button
            onClick={() => navigate('/plus/buses')}
            className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold transition flex items-center space-x-2"
          >
            <FaTimes />
            <span>Cancel</span>
          </button>
          <button
            onClick={handleSaveLayout}
            disabled={saving || (countSeats(lowerDeckGrid) === 0 && countSeats(upperDeckGrid) === 0)}
            className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <FaSave />
                <span>Save Layout</span>
              </>
            )}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
};

export default SeatLayoutDesigner;
